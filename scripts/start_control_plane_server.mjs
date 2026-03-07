import 'dotenv/config';

import { startControlPlaneServer } from '../apps/control-plane/dist/index.js';

const port = Number.parseInt(process.env.PORT ?? '8080', 10);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`invalid PORT: ${process.env.PORT ?? '<unset>'}`);
}

const hostname = process.env.CONTROL_PLANE_BIND_HOST ?? '0.0.0.0';
const server = await startControlPlaneServer({ port, hostname });

console.log(JSON.stringify({
  status: 'listening',
  baseUrl: server.baseUrl,
  storeMode: process.env.CONTROL_PLANE_STORE_MODE ?? 'file',
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
