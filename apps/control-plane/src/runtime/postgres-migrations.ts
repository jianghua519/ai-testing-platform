import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ControlPlaneMigrationRecord } from '../types.js';
import type { SqlPoolClientLike, SqlPoolLike } from './postgres-control-plane-store.js';

export const CONTROL_PLANE_MIGRATIONS_TABLE = 'control_plane_schema_migrations';
const MIGRATION_FILE_PATTERN = /^\d+_.+\.sql$/;

interface SqlMigrationFile {
  version: string;
  sql: string;
  checksum: string;
}

interface AppliedMigrationRow {
  version: string;
  checksum: string;
  applied_at: string;
}

const resolveMigrationDirectory = (): string => {
  const candidates = [
    path.resolve(process.cwd(), 'apps/control-plane/sql'),
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
  try {
    await executor.query(
      `create table if not exists ${CONTROL_PLANE_MIGRATIONS_TABLE} (
         version text primary key,
         checksum text not null,
         applied_at timestamptz not null
       )`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('pg-mem')) {
      throw error;
    }

    await executor.query(
      `create table if not exists ${CONTROL_PLANE_MIGRATIONS_TABLE} (
         version text,
         checksum text,
         applied_at timestamptz
       )`,
    );
  }
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

export const listControlPlanePostgresMigrations = async (pool: SqlPoolLike): Promise<ControlPlaneMigrationRecord[]> => {
  await ensureMigrationsTable(pool);
  const result = await pool.query<AppliedMigrationRow>(
    `select version, checksum, applied_at
     from ${CONTROL_PLANE_MIGRATIONS_TABLE}
     order by version asc`,
  );

  return result.rows.map((row) => ({
    version: row.version,
    checksum: row.checksum,
    appliedAt: row.applied_at,
  }));
};

export const runControlPlanePostgresMigrations = async (pool: SqlPoolLike): Promise<ControlPlaneMigrationRecord[]> => {
  await ensureMigrationsTable(pool);
  const [migrationFiles, appliedMigrations] = await Promise.all([
    readMigrationFiles(),
    listControlPlanePostgresMigrations(pool),
  ]);
  const appliedByVersion = new Map(appliedMigrations.map((migration) => [migration.version, migration]));

  for (const migration of migrationFiles) {
    const existing = appliedByVersion.get(migration.version);
    if (existing) {
      if (existing.checksum !== migration.checksum) {
        throw new Error(`migration checksum mismatch for ${migration.version}`);
      }
      continue;
    }

    const client = await pool.connect();
    try {
      await client.query('begin');
      await ensureMigrationsTable(client);
      await client.query(migration.sql);
      await client.query(
        `insert into ${CONTROL_PLANE_MIGRATIONS_TABLE} (version, checksum, applied_at) values ($1, $2, $3)`,
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

  return listControlPlanePostgresMigrations(pool);
};
