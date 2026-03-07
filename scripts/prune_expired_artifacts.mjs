import {
  createArtifactBlobStoreFromEnv,
  createControlPlaneStoreFromEnv,
} from '../apps/control-plane/dist/index.js';

const limit = Number.parseInt(process.env.CONTROL_PLANE_ARTIFACT_PRUNE_LIMIT ?? '100', 10);
if (Number.isNaN(limit) || limit <= 0) {
  throw new Error(`invalid CONTROL_PLANE_ARTIFACT_PRUNE_LIMIT: ${process.env.CONTROL_PLANE_ARTIFACT_PRUNE_LIMIT ?? '<unset>'}`);
}

const store = await createControlPlaneStoreFromEnv(process.env);
const blobStore = createArtifactBlobStoreFromEnv(process.env);

try {
  if (!store.listExpiredArtifacts || !store.deleteArtifacts) {
    throw new Error('artifact pruning requires a postgres-backed control plane store');
  }

  const expiredArtifacts = await store.listExpiredArtifacts({ limit });
  const deletedArtifactIds = [];
  const failures = [];

  for (const artifact of expiredArtifacts) {
    try {
      await blobStore.deleteArtifact(artifact);
      deletedArtifactIds.push(artifact.artifactId);
    } catch (error) {
      failures.push({
        artifactId: artifact.artifactId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const deletedCount = await store.deleteArtifacts(deletedArtifactIds);

  console.log(JSON.stringify({
    scannedCount: expiredArtifacts.length,
    deletedCount,
    deletedArtifactIds,
    failures,
  }, null, 2));

  if (failures.length > 0) {
    process.exitCode = 1;
  }
} finally {
  await store.close?.();
}
