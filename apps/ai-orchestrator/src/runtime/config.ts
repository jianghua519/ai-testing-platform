import type { AiProviderName } from '../types.js';

export type AiOrchestratorStoreMode = 'memory' | 'postgres';

export interface AiOrchestratorConfig {
  port: number;
  hostname: string;
  provider: AiProviderName;
  storeMode: AiOrchestratorStoreMode;
  databaseUrl: string | null;
  runMigrations: boolean;
  googleApiKey: string | null;
  googleModel: string;
  openaiApiKey: string | null;
  openaiModel: string;
  openaiBaseUrl: string | null;
  temperature: number;
  memoryMaxFacts: number;
  controlPlaneBaseUrl: string;
}

const parseInteger = (value: string | undefined, fallback: number, name: string): number => {
  if (value == null || value.trim() === '') {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(`invalid ${name}: ${value}`);
  }

  return parsed;
};

const parseTemperature = (value: string | undefined): number => {
  if (value == null || value.trim() === '') {
    return 0.1;
  }

  const parsed = Number.parseFloat(value);
  if (Number.isNaN(parsed) || parsed < 0 || parsed > 2) {
    throw new Error(`invalid AI_PROVIDER_TEMPERATURE: ${value}`);
  }

  return parsed;
};

const parseProvider = (value: string | undefined): AiProviderName => {
  const normalized = (value ?? 'google').trim().toLowerCase();
  if (normalized === 'google' || normalized === 'openai' || normalized === 'mock') {
    return normalized;
  }

  throw new Error(`invalid AI_PROVIDER: ${value ?? '<unset>'}`);
};

const optional = (value: string | undefined): string | null => {
  const normalized = value?.trim();
  return normalized ? normalized : null;
};

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value == null || value.trim() === '') {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') {
    return true;
  }

  if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') {
    return false;
  }

  throw new Error(`invalid boolean value: ${value}`);
};

const parseStoreMode = (value: string | undefined, databaseUrl: string | null): AiOrchestratorStoreMode => {
  const normalized = (value ?? (databaseUrl ? 'postgres' : 'memory')).trim().toLowerCase();
  if (normalized === 'memory' || normalized === 'postgres') {
    return normalized;
  }

  throw new Error(`invalid AI_ORCHESTRATOR_STORE_MODE: ${value ?? '<unset>'}`);
};

export const loadAiOrchestratorConfig = (env: NodeJS.ProcessEnv = process.env): AiOrchestratorConfig => {
  const provider = parseProvider(env.AI_PROVIDER);
  const databaseUrl = optional(env.AI_ORCHESTRATOR_DATABASE_URL ?? env.CONTROL_PLANE_DATABASE_URL);
  const storeMode = parseStoreMode(env.AI_ORCHESTRATOR_STORE_MODE, databaseUrl);

  if (storeMode === 'postgres' && !databaseUrl) {
    throw new Error('AI_ORCHESTRATOR_DATABASE_URL is required when AI_ORCHESTRATOR_STORE_MODE=postgres');
  }

  return {
    port: parseInteger(env.AI_ORCHESTRATOR_PORT ?? env.PORT, 8081, 'AI_ORCHESTRATOR_PORT'),
    hostname: env.AI_ORCHESTRATOR_BIND_HOST ?? '0.0.0.0',
    provider,
    storeMode,
    databaseUrl,
    runMigrations: parseBoolean(env.AI_ORCHESTRATOR_RUN_MIGRATIONS, true),
    googleApiKey: optional(env.GOOGLE_API_KEY),
    googleModel: env.AI_GOOGLE_MODEL ?? 'gemini-2.5-flash',
    openaiApiKey: optional(env.OPENAI_API_KEY),
    openaiModel: env.AI_OPENAI_MODEL ?? 'gpt-4.1-mini',
    openaiBaseUrl: optional(env.AI_OPENAI_BASE_URL),
    temperature: parseTemperature(env.AI_PROVIDER_TEMPERATURE),
    memoryMaxFacts: parseInteger(env.AI_MEMORY_MAX_FACTS, 32, 'AI_MEMORY_MAX_FACTS'),
    controlPlaneBaseUrl: env.CONTROL_PLANE_BASE_URL ?? 'http://127.0.0.1:8080',
  };
};
