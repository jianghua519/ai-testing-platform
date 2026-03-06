import type { ArtifactReference } from '@aiwtp/web-dsl-schema';
import type { ArtifactCollector } from '../types.js';

export class NoopArtifactCollector implements ArtifactCollector {
  async collectForStep(_stepId: string): Promise<ArtifactReference[]> {
    return [];
  }
}
