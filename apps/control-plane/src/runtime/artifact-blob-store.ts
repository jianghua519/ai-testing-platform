import { createReadStream } from 'node:fs';
import { rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { DeleteObjectCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { ControlPlaneArtifactRecord } from '../types.js';

type ArtifactStorageBackend = 'filesystem' | 's3';

interface S3ClientConfig {
  endpoint: string;
  publicEndpoint?: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  signedUrlTtlSeconds: number;
}

interface S3ObjectLocation {
  bucket: string;
  key: string;
}

export type ArtifactDownloadMode = 'redirect' | 'stream';

export interface ArtifactDownloadDescriptor {
  kind: 'redirect' | 'stream';
  location?: string;
  body?: Readable;
  contentType?: string | null;
  contentLength?: number | null;
  filename: string;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const parseBoolean = (value: string | undefined, defaultValue: boolean): boolean => {
  if (value === undefined) {
    return defaultValue;
  }
  return value === 'true';
};

const parsePositiveInteger = (value: string | undefined, defaultValue: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return defaultValue;
  }
  return parsed;
};

const resolveStorageBackend = (artifact: ControlPlaneArtifactRecord): ArtifactStorageBackend => {
  const backend = artifact.metadata.storage_backend;
  if (backend === 's3' || artifact.storageUri.startsWith('s3://')) {
    return 's3';
  }
  return 'filesystem';
};

const parseS3Uri = (storageUri: string): S3ObjectLocation => {
  const parsed = new URL(storageUri);
  const bucket = parsed.hostname;
  const key = parsed.pathname.replace(/^\/+/, '');
  if (!bucket || !key) {
    throw new Error(`invalid artifact s3 uri: ${storageUri}`);
  }
  return {
    bucket,
    key: decodeURIComponent(key),
  };
};

const resolveS3ObjectLocation = (artifact: ControlPlaneArtifactRecord): S3ObjectLocation => {
  const metadata = isObject(artifact.metadata) ? artifact.metadata : {};
  const bucket = typeof metadata.storage_bucket === 'string' ? metadata.storage_bucket : undefined;
  const key = typeof metadata.storage_object_key === 'string' ? metadata.storage_object_key : undefined;
  if (bucket && key) {
    return { bucket, key };
  }
  return parseS3Uri(artifact.storageUri);
};

const resolveFilename = (artifact: ControlPlaneArtifactRecord): string => {
  const metadata = isObject(artifact.metadata) ? artifact.metadata : {};
  if (typeof metadata.file_name === 'string' && metadata.file_name.length > 0) {
    return metadata.file_name;
  }

  if (artifact.storageUri.startsWith('file://')) {
    return path.basename(fileURLToPath(artifact.storageUri));
  }

  if (artifact.storageUri.startsWith('s3://')) {
    return path.basename(resolveS3ObjectLocation(artifact).key);
  }

  return `${artifact.artifactId}.${artifact.artifactType}`;
};

const toNodeReadable = (body: unknown): Readable => {
  if (body instanceof Readable) {
    return body;
  }

  if (isObject(body) && typeof body.transformToWebStream === 'function') {
    return Readable.fromWeb(body.transformToWebStream());
  }

  throw new Error('artifact body is not a readable stream');
};

const buildS3Client = (endpoint: string, config: S3ClientConfig): S3Client => new S3Client({
  endpoint,
  region: config.region,
  forcePathStyle: config.forcePathStyle,
  credentials: {
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  },
});

const parseS3ClientConfig = (env: NodeJS.ProcessEnv): S3ClientConfig | undefined => {
  const endpoint = env.ARTIFACT_S3_ENDPOINT;
  const accessKeyId = env.ARTIFACT_S3_ACCESS_KEY_ID;
  const secretAccessKey = env.ARTIFACT_S3_SECRET_ACCESS_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    return undefined;
  }

  return {
    endpoint,
    publicEndpoint: env.ARTIFACT_S3_PUBLIC_ENDPOINT,
    region: env.ARTIFACT_S3_REGION ?? 'us-east-1',
    accessKeyId,
    secretAccessKey,
    forcePathStyle: parseBoolean(env.ARTIFACT_S3_FORCE_PATH_STYLE, true),
    signedUrlTtlSeconds: parsePositiveInteger(env.ARTIFACT_DOWNLOAD_SIGNED_URL_TTL_SECONDS, 300),
  };
};

export class ControlPlaneArtifactBlobStore {
  private readonly s3Client?: S3Client;
  private readonly publicS3Client?: S3Client;

  constructor(private readonly s3Config?: S3ClientConfig) {
    if (s3Config) {
      this.s3Client = buildS3Client(s3Config.endpoint, s3Config);
      this.publicS3Client = buildS3Client(s3Config.publicEndpoint ?? s3Config.endpoint, s3Config);
    }
  }

  async openDownload(
    artifact: ControlPlaneArtifactRecord,
    mode: ArtifactDownloadMode,
  ): Promise<ArtifactDownloadDescriptor> {
    const filename = resolveFilename(artifact);
    if (resolveStorageBackend(artifact) === 's3') {
      return mode === 'redirect'
        ? this.buildRedirectDescriptor(artifact, filename)
        : this.buildS3StreamDescriptor(artifact, filename);
    }

    return this.buildFileStreamDescriptor(artifact, filename);
  }

  async deleteArtifact(artifact: ControlPlaneArtifactRecord): Promise<void> {
    if (resolveStorageBackend(artifact) === 's3') {
      if (!this.s3Client) {
        throw new Error('artifact blob store is not configured for s3 deletion');
      }
      const location = resolveS3ObjectLocation(artifact);
      await this.s3Client.send(new DeleteObjectCommand({
        Bucket: location.bucket,
        Key: location.key,
      }));
      return;
    }

    const filePath = fileURLToPath(artifact.storageUri);
    await rm(filePath, { force: true });
  }

  private async buildRedirectDescriptor(
    artifact: ControlPlaneArtifactRecord,
    filename: string,
  ): Promise<ArtifactDownloadDescriptor> {
    if (!this.publicS3Client || !this.s3Config) {
      throw new Error('artifact blob store is not configured for s3 downloads');
    }

    const location = resolveS3ObjectLocation(artifact);
    const url = await getSignedUrl(
      this.publicS3Client,
      new GetObjectCommand({
        Bucket: location.bucket,
        Key: location.key,
        ResponseContentType: artifact.contentType ?? undefined,
        ResponseContentDisposition: `attachment; filename="${filename}"`,
      }),
      { expiresIn: this.s3Config.signedUrlTtlSeconds },
    );

    return {
      kind: 'redirect',
      location: url,
      filename,
    };
  }

  private async buildS3StreamDescriptor(
    artifact: ControlPlaneArtifactRecord,
    filename: string,
  ): Promise<ArtifactDownloadDescriptor> {
    if (!this.s3Client) {
      throw new Error('artifact blob store is not configured for s3 downloads');
    }

    const location = resolveS3ObjectLocation(artifact);
    const response = await this.s3Client.send(new GetObjectCommand({
      Bucket: location.bucket,
      Key: location.key,
    }));

    if (!response.Body) {
      throw new Error(`artifact object body missing for ${artifact.artifactId}`);
    }

    return {
      kind: 'stream',
      body: toNodeReadable(response.Body),
      contentType: response.ContentType ?? artifact.contentType,
      contentLength: response.ContentLength ?? artifact.sizeBytes,
      filename,
    };
  }

  private async buildFileStreamDescriptor(
    artifact: ControlPlaneArtifactRecord,
    filename: string,
  ): Promise<ArtifactDownloadDescriptor> {
    const filePath = fileURLToPath(artifact.storageUri);
    const fileStat = await stat(filePath);
    return {
      kind: 'stream',
      body: createReadStream(filePath),
      contentType: artifact.contentType ?? 'application/octet-stream',
      contentLength: artifact.sizeBytes ?? fileStat.size,
      filename,
    };
  }
}

export const createArtifactBlobStoreFromEnv = (env: NodeJS.ProcessEnv = process.env): ControlPlaneArtifactBlobStore =>
  new ControlPlaneArtifactBlobStore(parseS3ClientConfig(env));
