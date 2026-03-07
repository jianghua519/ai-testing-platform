import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { SqlPoolClientLike, SqlPoolLike } from './postgres-thread-store.js';

export const AI_ORCHESTRATOR_MIGRATIONS_TABLE = 'ai_orchestrator_schema_migrations';
const MIGRATION_FILE_PATTERN = /^\d+_.+\.sql$/;

interface SqlMigrationFile {
  version: string;
  sql: string;
  checksum: string;
}

interface AppliedMigrationRow {
  version: string;
  checksum: string;
}

const resolveMigrationDirectory = (): string => {
  const candidates = [
    path.resolve(process.cwd(), 'apps/ai-orchestrator/sql'),
    fileURLToPath(new URL('../../sql', import.meta.url)),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0];
};

const checksumSql = (sql: string): string => createHash('sha256').update(sql).digest('hex');

const ensureMigrationsTable = async (executor: SqlPoolLike | SqlPoolClientLike): Promise<void> => {
  await executor.query(
    `create table if not exists ${AI_ORCHESTRATOR_MIGRATIONS_TABLE} (
       version text primary key,
       checksum text not null,
       applied_at timestamptz not null
     )`,
  );
};

const readMigrationFiles = async (): Promise<SqlMigrationFile[]> => {
  const directory = resolveMigrationDirectory();
  const entries = await readdir(directory, { withFileTypes: true });
  const migrationFiles = entries
    .filter((entry) => entry.isFile() && MIGRATION_FILE_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  const migrations: SqlMigrationFile[] = [];
  for (const filename of migrationFiles) {
    const sql = await readFile(path.join(directory, filename), 'utf8');
    migrations.push({
      version: filename,
      sql,
      checksum: checksumSql(sql),
    });
  }

  return migrations;
};

export const runAiOrchestratorPostgresMigrations = async (pool: SqlPoolLike): Promise<string[]> => {
  await ensureMigrationsTable(pool);
  const [migrationFiles, appliedRows] = await Promise.all([
    readMigrationFiles(),
    pool.query<AppliedMigrationRow>(
      `select version, checksum
       from ${AI_ORCHESTRATOR_MIGRATIONS_TABLE}
       order by version asc`,
    ),
  ]);
  const appliedByVersion = new Map(appliedRows.rows.map((row) => [row.version, row]));

  for (const migration of migrationFiles) {
    const existing = appliedByVersion.get(migration.version);
    if (existing) {
      if (existing.checksum !== migration.checksum) {
        throw new Error(`ai-orchestrator migration checksum mismatch for ${migration.version}`);
      }
      continue;
    }

    const client = await pool.connect();
    try {
      await client.query('begin');
      await ensureMigrationsTable(client);
      await client.query(migration.sql);
      await client.query(
        `insert into ${AI_ORCHESTRATOR_MIGRATIONS_TABLE} (version, checksum, applied_at)
         values ($1, $2, $3)`,
        [migration.version, migration.checksum, new Date().toISOString()],
      );
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  const applied = await pool.query<AppliedMigrationRow>(
    `select version, checksum
     from ${AI_ORCHESTRATOR_MIGRATIONS_TABLE}
     order by version asc`,
  );
  return applied.rows.map((row) => row.version);
};
