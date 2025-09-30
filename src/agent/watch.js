import { promises as fs } from 'fs';
import path from 'path';
import { appendToArray, readJson } from '../db/fileDb.js';
import { processClaim } from './processClaim.js';

const INBOX_DIR = 'data/inbox';
const CLAIMS_PATH = 'data/db/claims.json';

const ensureDir = async (dir) => fs.mkdir(dir, { recursive: true });

const parseTxtClaim = (content) => {
  const obj = {};
  for (const line of content.split(/\r?\n/)) {
    const [k, ...rest] = line.split(':');
    if (!k) continue;
    obj[k.trim()] = rest.join(':').trim();
  }
  const amount = parseFloat(obj.amount || obj.claimAmount || '0');
  return {
    id: obj.id || `CLM-${Date.now()}`,
    claimantId: obj.claimantId,
    policyId: obj.policyId,
    incident: {
      date: obj.incidentDate,
      type: obj.incidentType,
      description: obj.description,
      location: { city: obj.city, state: obj.state, country: obj.country || 'US' }
    },
    amount,
    attachments: [],
    channel: 'paper',
    status: 'submitted',
    flags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
};

const ingestFile = async (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  const raw = await fs.readFile(filePath, 'utf-8');
  const claim = ext === '.json' ? JSON.parse(raw) : parseTxtClaim(raw);
  const exists = (await readJson(CLAIMS_PATH, [])).some((c) => c.id === claim.id);
  const id = exists ? `${claim.id}-${Date.now()}` : claim.id;
  const normalized = { ...claim, id, channel: claim.channel || 'paper', status: 'submitted', createdAt: claim.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
  await appendToArray(CLAIMS_PATH, normalized);
  await processClaim(normalized.id);
};

const poll = async () => {
  await ensureDir(INBOX_DIR);
  const files = await fs.readdir(INBOX_DIR);
  for (const f of files) {
    if (!/\.(json|txt)$/i.test(f)) continue;
    const full = path.join(INBOX_DIR, f);
    await ingestFile(full);
    await fs.unlink(full);
  }
};

const main = async () => {
  await ensureDir(INBOX_DIR);
  setInterval(poll, 5000);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
