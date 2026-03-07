import 'dotenv/config';

import { Pool } from 'pg';
import { runControlPlanePostgresMigrations } from '../apps/control-plane/dist/index.js';

const connectionString = process.env.CONTROL_PLANE_DATABASE_URL;
if (!connectionString) {
  console.error('CONTROL_PLANE_DATABASE_URL is required');
  process.exit(1);
}

const pool = new Pool({ connectionString });
try {
  const items = await runControlPlanePostgresMigrations(pool);
  console.log(JSON.stringify({ appliedCount: items.length, items }, null, 2));
} finally {
  await pool.end();
}
