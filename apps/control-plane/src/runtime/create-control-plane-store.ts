import path from 'node:path';
import type { ControlPlaneStore } from '../types.js';
import { FileBackedControlPlaneStore } from './file-backed-control-plane-store.js';
import { InMemoryControlPlaneState } from './control-plane-state.js';

export const createControlPlaneStoreFromEnv = async (env: NodeJS.ProcessEnv = process.env): Promise<ControlPlaneStore> => {
  const mode = env.CONTROL_PLANE_STORE_MODE ?? 'file';

  if (mode === 'inmemory') {
    return new InMemoryControlPlaneState();
  }

  const filePath = env.CONTROL_PLANE_STATE_FILE ?? path.resolve(process.cwd(), '.data/control-plane-state.json');
  return FileBackedControlPlaneStore.open({ filePath });
};
