import { readJson } from '../db/fileDb.js';
import { processClaim } from './processClaim.js';

const CLAIMS_PATH = 'data/db/claims.json';

const main = async () => {
  const claims = await readJson(CLAIMS_PATH, []);
  const pending = claims.filter((c) => c.status === 'submitted' || c.status === 'pending');
  for (const c of pending) {
    await processClaim(c.id);
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
