import path from 'node:path';
import type { ControlPlaneStore } from '../types.js';
import { FileBackedControlPlaneStore } from './file-backed-control-plane-store.js';
import { InMemoryControlPlaneState } from './control-plane-state.js';
import { PostgresControlPlaneStore } from './postgres-control-plane-store.js';

export const createControlPlaneStoreFromEnv = async (env: NodeJS.ProcessEnv = process.env): Promise<ControlPlaneStore> => {
  const mode = env.CONTROL_PLANE_STORE_MODE ?? 'file';

  if (mode === 'inmemory') {
    return new InMemoryControlPlaneState();
  }

  if (mode === 'postgres') {
    const connectionString = env.CONTROL_PLANE_DATABASE_URL;
    if (!connectionString) {
      throw new Error('CONTROL_PLANE_DATABASE_URL is required when CONTROL_PLANE_STORE_MODE=postgres');
    }

    return PostgresControlPlaneStore.open({
      connectionString,
      runMigrations: env.CONTROL_PLANE_RUN_MIGRATIONS
        ? env.CONTROL_PLANE_RUN_MIGRATIONS !== 'false'
        : env.CONTROL_PLANE_AUTO_MIGRATE !== 'false',
    });
  }

  const filePath = env.CONTROL_PLANE_STATE_FILE ?? path.resolve(process.cwd(), '.data/control-plane-state.json');
  return FileBackedControlPlaneStore.open({ filePath });
};
