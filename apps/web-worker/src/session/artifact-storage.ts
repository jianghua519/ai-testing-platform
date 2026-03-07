import { randomUUID, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { ArtifactReference } from '@aiwtp/web-dsl-schema';
import type { JobMetadata } from '../job-runner/types.js';

type ArtifactStorageMode = 'filesystem' | 's3';

interface PersistArtifactInput {
  kind: ArtifactReference['kind'];
  filePath: string;
  contentType: string;
  metadata: Record<string, unknown>;
}

interface ArtifactStats {
  body: Buffer;
  sizeBytes: number;
  sha256: string;
}

interface ArtifactStorageBackend {
  persistArtifact(input: PersistArtifactInput): Promise<ArtifactReference>;
}

interface S3ArtifactStorageConfig {
  endpoint: string;
  publicEndpoint?: string;
  region: string;
  bucket: string;
  keyPrefix: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const RETENTION_ENV_BY_KIND: Record<ArtifactReference['kind'], string> = {
  screenshot: 'ARTIFACT_RETENTION_DAYS_SCREENSHOT',
  trace: 'ARTIFACT_RETENTION_DAYS_TRACE',
  video: 'ARTIFACT_RETENTION_DAYS_VIDEO',
  dom_snapshot: 'ARTIFACT_RETENTION_DAYS_DOM_SNAPSHOT',
  network_capture: 'ARTIFACT_RETENTION_DAYS_NETWORK_CAPTURE',
};

const sanitizeKeySegment = (value: string): string =>
  value.replace(/[^a-zA-Z0-9._/-]+/g, '-').replace(/^-+|-+$/g, '') || 'artifact';

const parseRetentionDays = (kind: ArtifactReference['kind'], env: NodeJS.ProcessEnv): number => {
  const specific = env[RETENTION_ENV_BY_KIND[kind]];
  const fallback = env.ARTIFACT_RETENTION_DAYS_DEFAULT ?? '7';
  const value = Number.parseInt(specific ?? fallback, 10);
  if (Number.isNaN(value) || value < 0) {
    return 7;
  }
  return value;
};

const buildRetentionExpiresAt = (kind: ArtifactReference['kind'], env: NodeJS.ProcessEnv): string => {
  const retentionDays = parseRetentionDays(kind, env);
  return new Date(Date.now() + retentionDays * DAY_MS).toISOString();
};

const readArtifactStats = async (filePath: string): Promise<ArtifactStats> => {
  const body = await readFile(filePath);
  const sha256 = createHash('sha256').update(body).digest('hex');
  return {
    body,
    sizeBytes: body.byteLength,
    sha256,
  };
};

const parseBoolean = (value: string | undefined, defaultValue: boolean): boolean => {
  if (value === undefined) {
    return defaultValue;
  }
  return value === 'true';
};

const parseS3Config = (env: NodeJS.ProcessEnv): S3ArtifactStorageConfig => {
  const endpoint = env.ARTIFACT_S3_ENDPOINT;
  const bucket = env.ARTIFACT_S3_BUCKET;
  const accessKeyId = env.ARTIFACT_S3_ACCESS_KEY_ID;
  const secretAccessKey = env.ARTIFACT_S3_SECRET_ACCESS_KEY;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error('ARTIFACT_S3_ENDPOINT, ARTIFACT_S3_BUCKET, ARTIFACT_S3_ACCESS_KEY_ID and ARTIFACT_S3_SECRET_ACCESS_KEY are required when ARTIFACT_STORAGE_MODE=s3');
  }

  return {
    endpoint,
    publicEndpoint: env.ARTIFACT_S3_PUBLIC_ENDPOINT,
    region: env.ARTIFACT_S3_REGION ?? 'us-east-1',
    bucket,
    keyPrefix: (env.ARTIFACT_S3_PREFIX ?? 'artifacts').replace(/^\/+|\/+$/g, ''),
    accessKeyId,
    secretAccessKey,
    forcePathStyle: parseBoolean(env.ARTIFACT_S3_FORCE_PATH_STYLE, true),
  };
};

const buildMetadata = (
  input: PersistArtifactInput,
  metadata: JobMetadata,
  retentionExpiresAt: string,
  extra: Record<string, unknown>,
): Record<string, unknown> => ({
  ...input.metadata,
  ...extra,
  run_id: metadata.runId,
  run_item_id: metadata.runItemId,
  attempt_no: metadata.attemptNo,
  retention_expires_at: retentionExpiresAt,
});

class FilesystemArtifactStorage implements ArtifactStorageBackend {
  constructor(
    private readonly metadata: JobMetadata,
    private readonly env: NodeJS.ProcessEnv,
  ) {}

  async persistArtifact(input: PersistArtifactInput): Promise<ArtifactReference> {
    const stats = await readArtifactStats(input.filePath);
    const retentionExpiresAt = buildRetentionExpiresAt(input.kind, this.env);
    return {
      artifactId: randomUUID(),
      kind: input.kind,
      uri: pathToFileURL(input.filePath).toString(),
      contentType: input.contentType,
      sizeBytes: stats.sizeBytes,
      sha256: stats.sha256,
      retentionExpiresAt,
      metadata: buildMetadata(input, this.metadata, retentionExpiresAt, {
        storage_backend: 'filesystem',
        download_strategy: 'stream',
      }),
    };
  }
}

class S3ArtifactStorage implements ArtifactStorageBackend {
  private readonly client: S3Client;

  constructor(
    private readonly config: S3ArtifactStorageConfig,
    private readonly rootDir: string,
    private readonly metadata: JobMetadata,
    private readonly env: NodeJS.ProcessEnv,
  ) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async persistArtifact(input: PersistArtifactInput): Promise<ArtifactReference> {
    const stats = await readArtifactStats(input.filePath);
    const objectKey = this.buildObjectKey(input.filePath);
    await this.client.send(new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: objectKey,
      Body: stats.body,
      ContentType: input.contentType,
      Metadata: {
        artifact_kind: input.kind,
        run_id: this.metadata.runId,
        run_item_id: this.metadata.runItemId,
        attempt_no: String(this.metadata.attemptNo),
      },
    }));

    const retentionExpiresAt = buildRetentionExpiresAt(input.kind, this.env);
    return {
      artifactId: randomUUID(),
      kind: input.kind,
      uri: `s3://${this.config.bucket}/${objectKey}`,
      contentType: input.contentType,
      sizeBytes: stats.sizeBytes,
      sha256: stats.sha256,
      retentionExpiresAt,
      metadata: buildMetadata(input, this.metadata, retentionExpiresAt, {
        storage_backend: 's3',
        storage_bucket: this.config.bucket,
        storage_object_key: objectKey,
        download_strategy: 'signed_url_or_stream',
        public_endpoint: this.config.publicEndpoint,
      }),
    };
  }

  private buildObjectKey(filePath: string): string {
    const relativePath = path.relative(this.rootDir, filePath).split(path.sep).join('/');
    return [
      this.config.keyPrefix,
      sanitizeKeySegment(this.metadata.tenantId),
      sanitizeKeySegment(this.metadata.projectId),
      sanitizeKeySegment(this.metadata.runId),
      sanitizeKeySegment(this.metadata.runItemId),
      `attempt-${this.metadata.attemptNo}`,
      sanitizeKeySegment(relativePath),
    ].filter(Boolean).join('/');
  }
}

export const createArtifactStorageFromEnv = (
  rootDir: string,
  metadata: JobMetadata,
  env: NodeJS.ProcessEnv = process.env,
): ArtifactStorageBackend => {
  const mode = (env.ARTIFACT_STORAGE_MODE ?? 'filesystem') as ArtifactStorageMode;
  if (mode === 's3') {
    return new S3ArtifactStorage(parseS3Config(env), rootDir, metadata, env);
  }
  return new FilesystemArtifactStorage(metadata, env);
};
