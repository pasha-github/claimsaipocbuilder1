import { promises as fs } from 'fs';
import path from 'path';

const ensureDir = async (dirPath) => {
  await fs.mkdir(dirPath, { recursive: true });
};

export const readJson = async (relPath, defaultValue) => {
  const abs = path.join(process.cwd(), relPath);
  try {
    const data = await fs.readFile(abs, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    if (e.code === 'ENOENT') return defaultValue;
    throw e;
  }
};

export const writeJson = async (relPath, data) => {
  const abs = path.join(process.cwd(), relPath);
  await ensureDir(path.dirname(abs));
  const json = JSON.stringify(data, null, 2);
  await fs.writeFile(abs, json, 'utf-8');
};

export const appendToArray = async (relPath, obj) => {
  const arr = await readJson(relPath, []);
  arr.push(obj);
  await writeJson(relPath, arr);
  return obj;
};

export const updateById = async (relPath, id, updater) => {
  const arr = await readJson(relPath, []);
  const idx = arr.findIndex((x) => x.id === id);
  if (idx === -1) return null;
  const updated = updater({ ...arr[idx] });
  arr[idx] = updated;
  await writeJson(relPath, arr);
  return updated;
};
