import 'dotenv/config';

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const CONTROL_PLANE_DEFAULT_DATABASE_URL = 'postgresql://aiwtp:aiwtp-password@postgres:5432/aiwtp';
const POSTGRES_DEFAULT_USER = 'aiwtp';
const LEGACY_COMPATIBILITY_DATABASES = ['aiwtp_ai_orch_persist'];

const assertSafeIdentifier = (value, label) => {
  if (!/^[A-Za-z0-9_]+$/.test(value)) {
    throw new Error(`invalid ${label}: ${value}`);
  }
  return value;
};

const parseDatabaseName = (connectionString, fallback) => {
  const url = new URL(connectionString);
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, '')) || fallback;
  return assertSafeIdentifier(databaseName, 'database name');
};

const runDockerCompose = async (args, { allowFailure = false } = {}) => {
  const command = ['docker', 'compose', ...args];
  try {
    const { stdout, stderr } = await execFileAsync(command[0], command.slice(1), {
      cwd: process.cwd(),
      env: process.env,
      maxBuffer: 1024 * 1024 * 16,
    });
    return { command: command.join(' '), stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (error) {
    if (allowFailure) {
      return {
        command: command.join(' '),
        stdout: String(error.stdout ?? '').trim(),
        stderr: String(error.stderr ?? '').trim(),
      };
    }

    const stdout = String(error.stdout ?? '').trim();
    const stderr = String(error.stderr ?? '').trim();
    const wrapped = new Error(`command failed: ${command.join(' ')}`);
    wrapped.cause = { stdout, stderr };
    throw wrapped;
  }
};

const postgresUser = assertSafeIdentifier(process.env.POSTGRES_USER ?? POSTGRES_DEFAULT_USER, 'postgres user');
const controlPlaneDatabase = parseDatabaseName(
  process.env.CONTROL_PLANE_DATABASE_URL ?? CONTROL_PLANE_DEFAULT_DATABASE_URL,
  'aiwtp',
);
const aiOrchestratorDatabase = parseDatabaseName(
  process.env.AI_ORCHESTRATOR_DATABASE_URL ?? process.env.CONTROL_PLANE_DATABASE_URL ?? CONTROL_PLANE_DEFAULT_DATABASE_URL,
  controlPlaneDatabase,
);
const activeDatabases = Array.from(new Set([controlPlaneDatabase, aiOrchestratorDatabase]));
const compatibilityDatabases = LEGACY_COMPATIBILITY_DATABASES.filter((database) => !activeDatabases.includes(database));

await runDockerCompose(['up', '-d', 'postgres', 'minio', '--wait']);
await runDockerCompose(['stop', 'control-plane', 'ai-orchestrator', 'tools'], { allowFailure: true });

for (const database of compatibilityDatabases) {
  await runDockerCompose([
    'exec',
    '-T',
    'postgres',
    'psql',
    '-U',
    postgresUser,
    '-d',
    'postgres',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    `drop database if exists "${database}" with (force)`,
  ]);
}

for (const database of activeDatabases) {
  await runDockerCompose([
    'exec',
    '-T',
    'postgres',
    'psql',
    '-U',
    postgresUser,
    '-d',
    'postgres',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    `drop database if exists "${database}" with (force)`,
  ]);
  await runDockerCompose([
    'exec',
    '-T',
    'postgres',
    'psql',
    '-U',
    postgresUser,
    '-d',
    'postgres',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    `create database "${database}" owner "${postgresUser}"`,
  ]);
}

await runDockerCompose(['run', '--rm', 'tools', 'npm', 'run', 'control-plane:migrate:postgres']);
await runDockerCompose(['run', '--rm', 'tools', 'npm', 'run', 'ai-orchestrator:migrate:postgres']);
await runDockerCompose(['up', '-d', 'control-plane', 'ai-orchestrator', 'tools', '--wait']);

console.log(JSON.stringify({
  status: 'ok',
  controlPlaneDatabase,
  aiOrchestratorDatabase,
  removedLegacyDatabases: compatibilityDatabases,
}, null, 2));
