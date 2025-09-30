import { promises as fs } from 'fs';
import path from 'path';

const ROOT = process.cwd();
const CREDS_PATH = 'data/connectors/credentials.json';

export const connectors = [
  { id: 'box', name: 'Box', type: 'storage', path: 'data/connectors/box', requiredFields: ['accessToken'] },
  { id: 'onedrive', name: 'OneDrive', type: 'storage', path: 'data/connectors/onedrive', requiredFields: ['accessToken'] },
  { id: 'duckcreek', name: 'DuckCreek', type: 'pas', requiredFields: ['apiKey', 'baseUrl'] },
  { id: 'guidewire', name: 'Guidewire', type: 'pas', requiredFields: ['apiKey', 'baseUrl'] }
];

const ensureDir = async (dir) => fs.mkdir(dir, { recursive: true });

export const readCreds = async () => {
  try { return JSON.parse(await fs.readFile(path.join(ROOT, CREDS_PATH), 'utf-8')); } catch (e) { return {}; }
};

export const writeCreds = async (data) => {
  const abs = path.join(ROOT, CREDS_PATH);
  await ensureDir(path.dirname(abs));
  await fs.writeFile(abs, JSON.stringify(data, null, 2), 'utf-8');
};

export const getConnector = (id) => connectors.find((c) => c.id === id);

export const isConnected = (id, creds) => {
  const cfg = getConnector(id);
  if (!cfg) return false;
  const c = (creds || {})[id];
  if (!c) return false;
  return (cfg.requiredFields || []).every((f) => typeof c[f] === 'string' && c[f].trim().length > 0);
};

export const listFiles = async (id) => {
  const cfg = getConnector(id);
  if (!cfg || cfg.type !== 'storage') return [];
  const dir = path.join(ROOT, cfg.path);
  await ensureDir(dir);
  const files = await fs.readdir(dir);
  return files.map((name) => ({ name, path: `${cfg.path}/${name}` }));
};

export const saveUpload = async (id, fileName, buffer) => {
  const cfg = getConnector(id);
  if (!cfg || cfg.type !== 'storage') throw new Error('Unsupported connector');
  const dir = path.join(ROOT, cfg.path);
  await ensureDir(dir);
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const full = path.join(dir, safeName);
  await fs.writeFile(full, buffer);
  return { name: safeName, path: `${cfg.path}/${safeName}` };
};
