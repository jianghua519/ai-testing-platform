export interface ConsoleConfig {
  port: number;
  hostname: string;
  databaseUrl: string;
  controlPlaneBaseUrl: string;
  controlPlanePublicBaseUrl: string;
  controlPlaneJwtSecret: string;
  aiOrchestratorBaseUrl: string;
  aiOutputRoot: string;
  defaultSubjectId: string;
}

const readRequired = (value: string | undefined, name: string): string => {
  if (!value?.trim()) {
    throw new Error(`${name} is required`);
  }
  return value.trim();
};

const parsePort = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? String(fallback), 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(`invalid port: ${value ?? '<unset>'}`);
  }
  return parsed;
};

export const loadConsoleConfig = (env: NodeJS.ProcessEnv = process.env): ConsoleConfig => ({
  port: parsePort(env.PORT, 8082),
  hostname: env.CONSOLE_BIND_HOST?.trim() || '0.0.0.0',
  databaseUrl: readRequired(env.CONSOLE_DATABASE_URL ?? env.CONTROL_PLANE_DATABASE_URL, 'CONSOLE_DATABASE_URL'),
  controlPlaneBaseUrl: readRequired(env.CONTROL_PLANE_BASE_URL, 'CONTROL_PLANE_BASE_URL'),
  controlPlanePublicBaseUrl: env.CONTROL_PLANE_PUBLIC_BASE_URL?.trim() || 'http://127.0.0.1:18080',
  controlPlaneJwtSecret: env.CONTROL_PLANE_JWT_SECRET?.trim() || 'local-control-plane-dev-secret',
  aiOrchestratorBaseUrl: readRequired(env.AI_ORCHESTRATOR_BASE_URL, 'AI_ORCHESTRATOR_BASE_URL'),
  aiOutputRoot: env.CONSOLE_AI_OUTPUT_ROOT?.trim() || '/tmp/aiwtp-ai-orchestrator',
  defaultSubjectId: env.CONSOLE_DEFAULT_SUBJECT_ID?.trim() || 'console-user',
});
