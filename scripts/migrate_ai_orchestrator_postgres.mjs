import 'dotenv/config';

import { Pool } from 'pg';

import {
  loadAiOrchestratorConfig,
  runAiOrchestratorPostgresMigrations,
} from '../apps/ai-orchestrator/dist/index.js';

const config = loadAiOrchestratorConfig(process.env);
if (!config.databaseUrl) {
  throw new Error('AI_ORCHESTRATOR_DATABASE_URL is required');
}

const pool = new Pool({
  connectionString: config.databaseUrl,
});

try {
  const items = await runAiOrchestratorPostgresMigrations(pool);
  console.log(JSON.stringify({
    status: 'ok',
    appliedCount: items.length,
    latestVersion: items.at(-1) ?? null,
  }, null, 2));
} finally {
  await pool.end();
}
