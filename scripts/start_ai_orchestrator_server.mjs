import 'dotenv/config';

import {
  loadAiOrchestratorConfig,
  startAiOrchestratorServer,
} from '../apps/ai-orchestrator/dist/index.js';

const config = loadAiOrchestratorConfig(process.env);
const server = await startAiOrchestratorServer(config);

console.log(JSON.stringify({
  status: 'listening',
  baseUrl: server.baseUrl,
  storeMode: config.storeMode,
  provider: config.provider,
  model: config.provider === 'google' ? config.googleModel : config.provider === 'openai' ? config.openaiModel : 'mock-deterministic',
}, null, 2));

let closing = false;
const shutdown = async (signal) => {
  if (closing) {
    return;
  }

  closing = true;
  await server.close();
  console.log(JSON.stringify({ status: 'closed', signal }, null, 2));
  process.exit(0);
};

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

await new Promise(() => {});
