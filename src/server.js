import http from 'http';
import { promises as fs } from 'fs';
import path from 'path';
import url from 'url';
import crypto from 'crypto';
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
const OAUTH_STATE_TTL = 10 * 60 * 1000;
const pendingOAuthStates = new Map();

const send = (res, code, body, headers = {}) => {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(code, { 'content-type': typeof body === 'string' || Buffer.isBuffer(body) ? 'text/plain' : 'application/json', ...headers });
  res.end(data);
};

const purgeExpiredOAuthStates = () => {
  const now = Date.now();
  for (const [key, created] of pendingOAuthStates.entries()) {
    if (now - created > OAUTH_STATE_TTL) pendingOAuthStates.delete(key);
  }
};

const createOAuthState = () => {
  purgeExpiredOAuthStates();
  const state = crypto.randomBytes(16).toString('hex');
  pendingOAuthStates.set(state, Date.now());
  return state;
};

const consumeOAuthState = (state) => {
  purgeExpiredOAuthStates();
  const created = pendingOAuthStates.get(state);
  if (!created) return false;
  pendingOAuthStates.delete(state);
  return Date.now() - created <= OAUTH_STATE_TTL;
};

const resolveBoxRedirectUri = (req) => {
  if (process.env.BOX_REDIRECT_URI) return process.env.BOX_REDIRECT_URI;
  const host = req.headers.host;
  if (!host) return null;
  const proto = req.headers['x-forwarded-proto'] || 'http';
  return `${proto}://${host}/oauth/box/callback`;
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

const parseText = (req) => new Promise((resolve, reject) => {
  let data = '';
  req.on('data', (chunk) => { data += chunk; });
  req.on('end', () => resolve(data));
  req.on('error', reject);
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

  // Import CSV (insurance dataset)
  if (pathname === '/api/import/csv' && req.method === 'POST') {
    const text = await parseText(req);
    const { claims: newClaims, policies: newPolicies } = parseInsuranceDatasetCsv(text);
    const policies = await readJson(POLICIES_PATH, []);
    const policiesById = new Map(policies.map(p => [p.id, p]));
    let addedPolicies = 0;
    for (const p of newPolicies) {
      if (!policiesById.has(p.id)) {
        policiesById.set(p.id, p);
        addedPolicies++;
      }
    }
    await writeJson(POLICIES_PATH, Array.from(policiesById.values()));

    const claims = await readJson(CLAIMS_PATH, []);
    for (const c of newClaims) claims.push(c);
    await writeJson(CLAIMS_PATH, claims);

    for (const c of newClaims) {
      await processClaim(c.id);
    }

    return send(res, 200, { imported: newClaims.length, policiesAdded: addedPolicies });
  }

  // Connectors APIs
  if (pathname === '/api/connectors/box/oauth/url' && req.method === 'GET') {
    const clientId = process.env.BOX_CLIENT_ID;
    const clientSecret = process.env.BOX_CLIENT_SECRET;
    if (!clientId || !clientSecret) return send(res, 500, { error: 'Box OAuth not configured' });
    const redirectUri = resolveBoxRedirectUri(req);
    if (!redirectUri) return send(res, 500, { error: 'Cannot determine redirect URI' });
    const state = createOAuthState();
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      state,
      scope: 'root_readwrite'
    });
    const authUrl = `https://account.box.com/api/oauth2/authorize?${params.toString()}`;
    return send(res, 200, { url: authUrl });
  }

  if (pathname === '/api/connectors' && req.method === 'GET') {
    const creds = await readCreds();
    const list = connectors.map((c) => ({ id: c.id, name: c.name, type: c.type, requiredFields: c.requiredFields, connected: isConnected(c.id, creds), oauth: !!c.supportsOAuth }));
    return send(res, 200, list);
  }

  if (pathname === '/oauth/box/callback' && req.method === 'GET') {
    const clientId = process.env.BOX_CLIENT_ID;
    const clientSecret = process.env.BOX_CLIENT_SECRET;
    const redirectUri = resolveBoxRedirectUri(req);
    if (!clientId || !clientSecret || !redirectUri) {
      return send(res, 500, 'Box OAuth not configured');
    }
    const query = new url.URL(req.url, 'http://localhost');
    const error = query.searchParams.get('error');
    if (error) {
      return send(res, 400, `Box OAuth error: ${error}`);
    }
    const code = query.searchParams.get('code');
    const state = query.searchParams.get('state');
    if (!code || !state) {
      return send(res, 400, 'Missing authorization code or state');
    }
    if (!consumeOAuthState(state)) {
      return send(res, 400, 'Invalid or expired state');
    }

    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri
    });
    const tokenRes = await fetch('https://api.box.com/oauth2/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString()
    });
    const payload = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !payload.access_token) {
      return send(res, 400, `Box token exchange failed: ${payload.error_description || 'Unknown error'}`);
    }
    const creds = await readCreds();
    const expiresIn = Number(payload.expires_in) || 0;
    creds.box = {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token,
      tokenType: payload.token_type,
      scope: payload.scope,
      expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
      obtainedAt: new Date().toISOString()
    };
    await writeCreds(creds);
    res.writeHead(302, { Location: '/web/pages/admin.html?box=connected' });
    res.end();
    return;
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
