import { createHmac, timingSafeEqual } from 'node:crypto';

export interface ControlPlaneJwtClaims {
  sub: string;
  tenant_id: string;
  iat?: number;
  exp?: number;
  jti?: string;
}

export interface AuthenticatedToken {
  subjectId: string;
  tenantId: string;
  issuedAt?: number;
  expiresAt?: number;
  tokenId?: string;
}

const DEFAULT_ALG = 'HS256';

const encodeBase64Url = (value: string): string =>
  Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

const decodeBase64Url = (value: string): string => {
  const normalized = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Buffer.from(normalized, 'base64').toString('utf8');
};

const readSecret = (env: NodeJS.ProcessEnv = process.env): string => env.CONTROL_PLANE_JWT_SECRET ?? 'local-control-plane-dev-secret';

const sign = (input: string, secret: string): string =>
  createHmac('sha256', secret)
    .update(input)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

export const signControlPlaneJwt = (
  claims: ControlPlaneJwtClaims,
  env: NodeJS.ProcessEnv = process.env,
): string => {
  const header = encodeBase64Url(JSON.stringify({ alg: DEFAULT_ALG, typ: 'JWT' }));
  const payload = encodeBase64Url(JSON.stringify(claims));
  const signature = sign(`${header}.${payload}`, readSecret(env));
  return `${header}.${payload}.${signature}`;
};

export const verifyControlPlaneJwt = (
  token: string,
  env: NodeJS.ProcessEnv = process.env,
): AuthenticatedToken => {
  const [headerSegment, payloadSegment, signatureSegment] = token.split('.');
  if (!headerSegment || !payloadSegment || !signatureSegment) {
    throw new Error('token must have three segments');
  }

  const header = JSON.parse(decodeBase64Url(headerSegment)) as { alg?: string };
  if (header.alg !== DEFAULT_ALG) {
    throw new Error(`unsupported jwt alg: ${header.alg ?? '<missing>'}`);
  }

  const expectedSignature = sign(`${headerSegment}.${payloadSegment}`, readSecret(env));
  const signatureBuffer = Buffer.from(signatureSegment);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) {
    throw new Error('invalid token signature');
  }

  const payload = JSON.parse(decodeBase64Url(payloadSegment)) as Partial<ControlPlaneJwtClaims>;
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw new Error('token sub is required');
  }
  if (typeof payload.tenant_id !== 'string' || payload.tenant_id.length === 0) {
    throw new Error('token tenant_id is required');
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === 'number' && payload.exp < now) {
    throw new Error('token expired');
  }

  return {
    subjectId: payload.sub,
    tenantId: payload.tenant_id,
    issuedAt: payload.iat,
    expiresAt: payload.exp,
    tokenId: payload.jti,
  };
};

export const readBearerToken = (authorizationHeader: string | undefined): string => {
  if (!authorizationHeader) {
    throw new Error('authorization header is required');
  }

  const [scheme, token] = authorizationHeader.split(/\s+/, 2);
  if (scheme !== 'Bearer' || !token) {
    throw new Error('authorization header must be Bearer <token>');
  }

  return token;
};
