import http from 'http';
import { promises as fs } from 'fs';
import path from 'path';
import url from 'url';
import Busboy from 'busboy';
import { readJson, appendToArray, writeJson } from './db/fileDb.js';
import { processClaim } from './agent/processClaim.js';
import { connectors, readCreds, writeCreds, getConnector, isConnected, listFiles, saveUpload } from './connectors/index.js';
import { parseInsuranceDatasetCsv } from './ingestion/parsers.js';

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.join(process.cwd());
const WEB_DIR = path.join(ROOT, 'web');
const CLAIMS_PATH = 'data/db/claims.json';
const PERSONS_PATH = 'data/db/persons.json';
const POLICIES_PATH = 'data/db/policies.json';

const send = (res, code, body, headers = {}) => {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(code, { 'content-type': typeof body === 'string' || Buffer.isBuffer(body) ? 'text/plain' : 'application/json', ...headers });
  res.end(data);
};

const serveStatic = async (req, res, pathname) => {
  let rel = pathname.replace(/^\/+/, '');
  if (rel === '' || rel === 'index.html') rel = 'web/pages/submit.html';
  const file = path.join(ROOT, rel);
  try {
    const data = await fs.readFile(file);
    const ext = path.extname(file).toLowerCase();
    const map = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' };
    send(res, 200, data, { 'content-type': map[ext] || 'application/octet-stream' });
  } catch (e) {
    send(res, 404, 'Not found');
  }
};

const parseBody = async (req) => new Promise((resolve, reject) => {
  let data = '';
  req.on('data', (chunk) => { data += chunk; });
  req.on('end', () => {
    try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); }
  });
});

const parseUploads = (req) => new Promise((resolve, reject) => {
  try {
    const bb = Busboy({ headers: req.headers });
    const files = [];
    bb.on('file', (name, file, info) => {
      const chunks = [];
      file.on('data', (d) => chunks.push(d));
      file.on('end', () => {
        files.push({ fieldname: name, filename: info.filename, buffer: Buffer.concat(chunks) });
      });
    });
    bb.on('error', reject);
    bb.on('finish', () => resolve(files));
    req.pipe(bb);
  } catch (e) { reject(e); }
});

const server = http.createServer(async (req, res) => {
  const { pathname } = new url.URL(req.url, 'http://localhost');

  // Claims APIs
  if (pathname === '/api/claims' && req.method === 'GET') {
    const claims = await readJson(CLAIMS_PATH, []);
    return send(res, 200, claims);
  }

  if (pathname?.startsWith('/api/claims/') && req.method === 'GET') {
    const id = pathname.split('/').pop();
    const claims = await readJson(CLAIMS_PATH, []);
    const claim = claims.find((c) => c.id === id);
    return claim ? send(res, 200, claim) : send(res, 404, { error: 'Not found' });
  }

  if (pathname === '/api/claims' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const claim = {
        ...body,
        id: body.id || `CLM-${Date.now()}`,
        channel: 'portal',
        status: 'submitted',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await appendToArray(CLAIMS_PATH, claim);
      const processed = await processClaim(claim.id);
      return send(res, 201, processed);
    } catch (e) {
      return send(res, 400, { error: 'Invalid JSON' });
    }
  }

  if (pathname === '/api/stats' && req.method === 'GET') {
    const claims = await readJson(CLAIMS_PATH, []);
    const totals = claims.reduce((acc, c) => {
      acc.count++;
      acc.amount += c.amount || 0;
      acc[c.status] = (acc[c.status] || 0) + 1;
      acc.payout = (acc.payout || 0) + (c.decision?.payout || 0);
      return acc;
    }, { count: 0, amount: 0, payout: 0 });
    return send(res, 200, totals);
  }

  // Policy/Person lookup
  if (pathname?.startsWith('/api/policies/') && req.method === 'GET') {
    const id = pathname.split('/').pop();
    const policies = await readJson(POLICIES_PATH, []);
    const policy = policies.find((p) => p.id === id || p.policyNumber === id);
    if (!policy) return send(res, 404, { error: 'Policy not found' });
    const persons = await readJson(PERSONS_PATH, []);
    const person = persons.find((p) => p.id === policy.personId);
    return send(res, 200, { policy, person });
  }

  // Connectors APIs
  if (pathname === '/api/connectors' && req.method === 'GET') {
    const creds = await readCreds();
    const list = connectors.map((c) => ({ id: c.id, name: c.name, type: c.type, requiredFields: c.requiredFields, connected: isConnected(c.id, creds) }));
    return send(res, 200, list);
  }

  if (pathname.startsWith('/api/connectors/') && pathname.endsWith('/credentials') && req.method === 'POST') {
    const id = pathname.split('/')[3];
    const cfg = getConnector(id);
    if (!cfg) return send(res, 404, { error: 'Unknown connector' });
    const body = await parseBody(req);
    const creds = await readCreds();
    creds[id] = body || {};
    await writeCreds(creds);
    const connected = isConnected(id, creds);
    return send(res, 200, { connected });
  }

  if (pathname.startsWith('/api/connectors/') && pathname.endsWith('/files') && req.method === 'GET') {
    const id = pathname.split('/')[3];
    const cfg = getConnector(id);
    if (!cfg) return send(res, 404, { error: 'Unknown connector' });
    const creds = await readCreds();
    if (cfg.type !== 'storage') return send(res, 200, []);
    if (!isConnected(id, creds)) return send(res, 401, { error: 'Not connected' });
    const files = await listFiles(id);
    return send(res, 200, files);
  }

  if (pathname.startsWith('/api/connectors/') && pathname.endsWith('/upload') && req.method === 'POST') {
    const id = pathname.split('/')[3];
    const cfg = getConnector(id);
    if (!cfg) return send(res, 404, { error: 'Unknown connector' });
    const creds = await readCreds();
    if (cfg.type !== 'storage') return send(res, 400, { error: 'Uploads not supported' });
    if (!isConnected(id, creds)) return send(res, 401, { error: 'Not connected' });
    try {
      const files = await parseUploads(req);
      const saved = [];
      for (const f of files) {
        const s = await saveUpload(id, f.filename, f.buffer);
        saved.push(s);
      }
      return send(res, 200, saved);
    } catch (e) {
      return send(res, 400, { error: 'Upload failed' });
    }
  }

  return serveStatic(req, res, pathname);
});

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
server.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
