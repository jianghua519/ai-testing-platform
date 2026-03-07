import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';

import type {
  AssistantMemoryFact,
  AssistantMessage,
  AssistantMessageRole,
  AssistantThread,
  CreateAssistantThreadInput,
} from '../types.js';
import type { AiOrchestratorConfig } from './config.js';
import { runAiOrchestratorPostgresMigrations } from './postgres-migrations.js';
import { buildAssistantTenantSchemaSql, quotePostgresIdentifier } from './postgres-schema.js';
import type { AssistantThreadStore } from './thread-store.js';

interface SqlQueryResult<Row> {
  rows: Row[];
  rowCount?: number | null;
}

export interface SqlPoolClientLike {
  query<Row = Record<string, unknown>>(text: string, values?: unknown[]): Promise<SqlQueryResult<Row>>;
  release(): void;
}

export interface SqlPoolLike {
  query<Row = Record<string, unknown>>(text: string, values?: unknown[]): Promise<SqlQueryResult<Row>>;
  connect(): Promise<SqlPoolClientLike>;
  end(): Promise<void>;
}

interface AssistantThreadLocatorRow {
  tenant_id: string;
  project_id: string;
}

interface AssistantThreadRow {
  thread_id: string;
  tenant_id: string;
  project_id: string;
  user_id: string | null;
  graph_type: 'assistant';
  title: string | null;
  created_at: string;
  updated_at: string;
}

interface AssistantMessageRow {
  message_id: string;
  thread_id: string;
  role: AssistantMessageRole;
  content: string;
  created_at: string;
}

interface AssistantMemoryFactRow {
  memory_fact_id: string;
  thread_id: string;
  content: string;
  confidence: number;
  source_message_id: string;
  source_type: 'user_message';
  created_at: string;
}

const toAssistantMessage = (row: AssistantMessageRow): AssistantMessage => ({
  id: row.message_id,
  threadId: row.thread_id,
  role: row.role,
  content: row.content,
  createdAt: row.created_at,
});

const toAssistantMemoryFact = (row: AssistantMemoryFactRow): AssistantMemoryFact => ({
  id: row.memory_fact_id,
  threadId: row.thread_id,
  content: row.content,
  confidence: row.confidence,
  sourceMessageId: row.source_message_id,
  sourceType: row.source_type,
  createdAt: row.created_at,
});

const toAssistantThread = (
  row: AssistantThreadRow,
  messages: AssistantMessage[],
  facts: AssistantMemoryFact[],
): AssistantThread => ({
  id: row.thread_id,
  title: row.title,
  tenantId: row.tenant_id,
  projectId: row.project_id,
  userId: row.user_id,
  graphType: row.graph_type,
  messages,
  facts,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class PostgresAssistantThreadStore implements AssistantThreadStore {
  readonly mode = 'postgres' as const;
  readonly #pool: SqlPoolLike;
  readonly #config: AiOrchestratorConfig;
  readonly #maxFacts: number;
  readonly #ensuredTenantSchemas = new Set<string>();

  constructor(config: AiOrchestratorConfig) {
    if (!config.databaseUrl) {
      throw new Error('AI_ORCHESTRATOR_DATABASE_URL is required for postgres assistant store');
    }

    this.#config = config;
    this.#maxFacts = config.memoryMaxFacts;
    this.#pool = new Pool({
      connectionString: config.databaseUrl,
    });
  }

  async initialize(): Promise<void> {
    if (this.#config.runMigrations) {
      await runAiOrchestratorPostgresMigrations(this.#pool);
    }

    await this.#reconcileExistingTenantSchemas();
  }

  async close(): Promise<void> {
    await this.#pool.end();
  }

  async createThread(input: CreateAssistantThreadInput = {}): Promise<AssistantThread> {
    const tenantId = input.tenantId?.trim();
    const projectId = input.projectId?.trim();

    if (!tenantId || !projectId) {
      throw new Error('tenantId and projectId are required for postgres assistant threads');
    }

    const threadId = randomUUID();
    const createdAt = new Date().toISOString();
    const title = input.title?.trim() || null;
    const userId = input.userId?.trim() || null;

    const client = await this.#pool.connect();
    try {
      await client.query('begin');
      const tenantSchema = await this.#ensureTenantSchema(tenantId, client);
      const threadsTable = this.#tableName(tenantSchema, 'assistant_threads');

      await client.query(
        `insert into ${threadsTable} (
           thread_id, tenant_id, project_id, user_id, graph_type, title, created_at, updated_at
         ) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [threadId, tenantId, projectId, userId, 'assistant', title, createdAt, createdAt],
      );
      await this.#upsertThreadLocator(client, threadId, tenantId, projectId);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }

    const thread = await this.getThread(threadId);
    if (!thread) {
      throw new Error(`assistant thread not found after creation: ${threadId}`);
    }
    return thread;
  }

  async getThread(threadId: string): Promise<AssistantThread | null> {
    const locator = await this.#getThreadLocator(threadId);
    if (!locator) {
      return null;
    }

    const tenantSchema = await this.#ensureTenantSchema(locator.tenant_id);
    const threadsTable = this.#tableName(tenantSchema, 'assistant_threads');
    const messagesTable = this.#tableName(tenantSchema, 'assistant_messages');
    const factsTable = this.#tableName(tenantSchema, 'assistant_memory_facts');

    const [threadResult, messagesResult, factsResult] = await Promise.all([
      this.#pool.query<AssistantThreadRow>(
        `select thread_id, tenant_id, project_id, user_id, graph_type, title, created_at, updated_at
         from ${threadsTable}
         where thread_id = $1
         limit 1`,
        [threadId],
      ),
      this.#pool.query<AssistantMessageRow>(
        `select message_id, thread_id, role, content, created_at
         from ${messagesTable}
         where thread_id = $1
         order by created_at asc, message_id asc`,
        [threadId],
      ),
      this.#pool.query<AssistantMemoryFactRow>(
        `select memory_fact_id, thread_id, content, confidence, source_message_id, source_type, created_at
         from ${factsTable}
         where thread_id = $1
         order by created_at asc, memory_fact_id asc`,
        [threadId],
      ),
    ]);

    const threadRow = threadResult.rows[0];
    if (!threadRow) {
      return null;
    }

    return toAssistantThread(
      threadRow,
      messagesResult.rows.map(toAssistantMessage),
      factsResult.rows.map(toAssistantMemoryFact),
    );
  }

  async appendMessage(threadId: string, role: AssistantMessageRole, content: string): Promise<AssistantMessage> {
    const locator = await this.#getRequiredThreadLocator(threadId);
    const tenantSchema = await this.#ensureTenantSchema(locator.tenant_id);
    const messagesTable = this.#tableName(tenantSchema, 'assistant_messages');
    const threadsTable = this.#tableName(tenantSchema, 'assistant_threads');
    const messageId = randomUUID();
    const createdAt = new Date().toISOString();
    const normalizedContent = content.trim();

    const client = await this.#pool.connect();
    try {
      await client.query('begin');
      await client.query(
        `insert into ${messagesTable} (message_id, thread_id, role, content, created_at)
         values ($1, $2, $3, $4, $5)`,
        [messageId, threadId, role, normalizedContent, createdAt],
      );
      await client.query(
        `update ${threadsTable}
         set updated_at = $2
         where thread_id = $1`,
        [threadId, createdAt],
      );
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }

    return {
      id: messageId,
      threadId,
      role,
      content: normalizedContent,
      createdAt,
    };
  }

  async rememberFacts(threadId: string, sourceMessageId: string, factContents: string[]): Promise<AssistantMemoryFact[]> {
    const locator = await this.#getRequiredThreadLocator(threadId);
    const tenantSchema = await this.#ensureTenantSchema(locator.tenant_id);
    const factsTable = this.#tableName(tenantSchema, 'assistant_memory_facts');
    const threadsTable = this.#tableName(tenantSchema, 'assistant_threads');
    const client = await this.#pool.connect();
    const remembered: AssistantMemoryFact[] = [];

    try {
      await client.query('begin');

      for (const rawContent of factContents) {
        const content = rawContent.trim();
        if (!content) {
          continue;
        }

        const createdAt = new Date().toISOString();
        const result = await client.query<AssistantMemoryFactRow>(
          `insert into ${factsTable} (
             memory_fact_id, thread_id, content, confidence, source_message_id, source_type, created_at
           ) values ($1, $2, $3, $4, $5, $6, $7)
           on conflict (thread_id, content) do update set
             confidence = excluded.confidence,
             source_message_id = excluded.source_message_id,
             source_type = excluded.source_type,
             created_at = excluded.created_at
           returning memory_fact_id, thread_id, content, confidence, source_message_id, source_type, created_at`,
          [randomUUID(), threadId, content, 0.7, sourceMessageId, 'user_message', createdAt],
        );
        const row = result.rows[0];
        if (row) {
          remembered.push(toAssistantMemoryFact(row));
        }
      }

      await client.query(
        `delete from ${factsTable}
         where memory_fact_id in (
           select memory_fact_id
           from ${factsTable}
           where thread_id = $1
           order by created_at desc, memory_fact_id desc
           offset $2
         )`,
        [threadId, this.#maxFacts],
      );

      await client.query(
        `update ${threadsTable}
         set updated_at = $2
         where thread_id = $1`,
        [threadId, new Date().toISOString()],
      );

      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }

    return remembered;
  }

  #tableName(tenantId: string, tableName: string): string {
    return `${quotePostgresIdentifier(tenantId)}.${quotePostgresIdentifier(tableName)}`;
  }

  async #reconcileExistingTenantSchemas(): Promise<void> {
    const result = await this.#pool.query<{ tenant_id: string }>(
      `select tenant_id
       from tenant_schemas
       order by tenant_id asc`,
    ).catch(() => ({ rows: [] }));

    for (const row of result.rows) {
      await this.#reconcileTenantSchema(row.tenant_id, this.#pool);
      this.#ensuredTenantSchemas.add(row.tenant_id);
    }
  }

  async #ensureTenantSchema(
    tenantId: string,
    executor: SqlPoolLike | SqlPoolClientLike = this.#pool,
  ): Promise<string> {
    if (!tenantId.trim()) {
      throw new Error('tenantId is required for postgres assistant store');
    }

    if (this.#ensuredTenantSchemas.has(tenantId)) {
      return tenantId;
    }

    await executor.query(
      `insert into tenant_schemas (tenant_id, schema_name)
       values ($1, $2)
       on conflict (tenant_id) do update set
         schema_name = excluded.schema_name,
         updated_at = now()`,
      [tenantId, tenantId],
    );
    await this.#reconcileTenantSchema(tenantId, executor);
    this.#ensuredTenantSchemas.add(tenantId);
    return tenantId;
  }

  async #reconcileTenantSchema(
    tenantId: string,
    executor: SqlPoolLike | SqlPoolClientLike,
  ): Promise<void> {
    await executor.query(buildAssistantTenantSchemaSql(tenantId));
  }

  async #getThreadLocator(
    threadId: string,
    executor: SqlPoolLike | SqlPoolClientLike = this.#pool,
  ): Promise<AssistantThreadLocatorRow | undefined> {
    const result = await executor.query<AssistantThreadLocatorRow>(
      `select tenant_id, project_id
       from assistant_thread_locators
       where thread_id = $1
       limit 1`,
      [threadId],
    );
    return result.rows[0];
  }

  async #getRequiredThreadLocator(threadId: string): Promise<AssistantThreadLocatorRow> {
    const locator = await this.#getThreadLocator(threadId);
    if (!locator) {
      throw new Error(`assistant thread not found: ${threadId}`);
    }

    return locator;
  }

  async #upsertThreadLocator(
    executor: SqlPoolLike | SqlPoolClientLike,
    threadId: string,
    tenantId: string,
    projectId: string,
  ): Promise<void> {
    await executor.query(
      `insert into assistant_thread_locators (thread_id, tenant_id, project_id)
       values ($1, $2, $3)
       on conflict (thread_id) do update set
         tenant_id = excluded.tenant_id,
         project_id = excluded.project_id,
         updated_at = now()`,
      [threadId, tenantId, projectId],
    );
  }
}
