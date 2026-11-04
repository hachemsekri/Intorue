import { loadEnv } from '../config/env';
import { createDatabase } from '../db/client';
import { migrate } from '../db/migrate';

async function main() {
  const env = loadEnv();
  const db = await createDatabase(env.DATABASE_URL);
  const applied = await migrate(db, (m) => console.log(m));
  console.log(applied.length ? `Done (${applied.length} applied).` : 'Database already up to date.');
  await db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
