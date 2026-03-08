import 'dotenv/config';

import {
  loadConsoleConfig,
  startConsoleServer,
} from '../apps/console/dist/index.js';

const config = loadConsoleConfig(process.env);
const server = await startConsoleServer(config);

console.log(JSON.stringify({
  status: 'listening',
  baseUrl: server.baseUrl,
  controlPlaneBaseUrl: config.controlPlaneBaseUrl,
  aiOrchestratorBaseUrl: config.aiOrchestratorBaseUrl,
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
