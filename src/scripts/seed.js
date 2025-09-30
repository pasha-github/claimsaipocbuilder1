import { readJson, writeJson } from '../db/fileDb.js';

const ensure = async (path, def) => {
  const cur = await readJson(path, null);
  if (cur === null) await writeJson(path, def);
};

const main = async () => {
  await ensure('data/db/claims.json', []);
  await ensure('data/db/persons.json', []);
  await ensure('data/db/policies.json', []);
  await ensure('data/inbox/.keep', '');
};

main();
