import { promises as fs } from 'fs';
import path from 'path';
import { appendToArray, readJson } from '../db/fileDb.js';
import { processClaim } from './processClaim.js';
import { parseTxtClaim, parseCsvClaims, parsePdfClaim } from '../ingestion/parsers.js';

const INBOX_DIR = 'data/inbox';
const CLAIMS_PATH = 'data/db/claims.json';

const ensureDir = async (dir) => fs.mkdir(dir, { recursive: true });

const ingestFile = async (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.json') {
    const raw = await fs.readFile(filePath, 'utf-8');
    const claim = JSON.parse(raw);
    const exists = (await readJson(CLAIMS_PATH, [])).some((c) => c.id === claim.id);
    const id = exists ? `${claim.id}-${Date.now()}` : (claim.id || `CLM-${Date.now()}`);
    const normalized = { ...claim, id, channel: claim.channel || 'paper', status: 'submitted', createdAt: claim.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
    await appendToArray(CLAIMS_PATH, normalized);
    await processClaim(normalized.id);
    return;
  }

  if (ext === '.txt') {
    const raw = await fs.readFile(filePath, 'utf-8');
    const claim = parseTxtClaim(raw);
    const exists = (await readJson(CLAIMS_PATH, [])).some((c) => c.id === claim.id);
    const id = exists ? `${claim.id}-${Date.now()}` : (claim.id || `CLM-${Date.now()}`);
    const normalized = { ...claim, id };
    await appendToArray(CLAIMS_PATH, normalized);
    await processClaim(normalized.id);
    return;
  }

  if (ext === '.csv') {
    const raw = await fs.readFile(filePath, 'utf-8');
    const claims = parseCsvClaims(raw);
    for (const claim of claims) {
      const exists = (await readJson(CLAIMS_PATH, [])).some((c) => c.id === claim.id);
      const id = exists ? `${claim.id}-${Date.now()}` : (claim.id || `CLM-${Date.now()}`);
      const normalized = { ...claim, id };
      await appendToArray(CLAIMS_PATH, normalized);
      await processClaim(normalized.id);
    }
    return;
  }

  if (ext === '.pdf') {
    const buffer = await fs.readFile(filePath);
    const claim = await parsePdfClaim(buffer);
    const exists = (await readJson(CLAIMS_PATH, [])).some((c) => c.id === claim.id);
    const id = exists ? `${claim.id}-${Date.now()}` : (claim.id || `CLM-${Date.now()}`);
    const normalized = { ...claim, id };
    await appendToArray(CLAIMS_PATH, normalized);
    await processClaim(normalized.id);
    return;
  }
};

const poll = async () => {
  await ensureDir(INBOX_DIR);
  const files = await fs.readdir(INBOX_DIR);
  for (const f of files) {
    if (!/\.(json|txt|csv|pdf)$/i.test(f)) continue;
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
