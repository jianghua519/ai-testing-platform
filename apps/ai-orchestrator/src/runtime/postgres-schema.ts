export const quotePostgresIdentifier = (value: string): string => `"${value.replace(/"/g, '""')}"`;

export const buildAssistantTenantSchemaSql = (tenantId: string): string => {
  const schema = quotePostgresIdentifier(tenantId);

  return `
create schema if not exists ${schema};

create table if not exists ${schema}.assistant_threads (
  thread_id text primary key,
  tenant_id text not null,
  project_id text not null,
  user_id text null,
  graph_type text not null,
  title text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_assistant_threads_tenant_project_updated
  on ${schema}.assistant_threads (tenant_id, project_id, updated_at desc);

create table if not exists ${schema}.assistant_messages (
  message_id text primary key,
  thread_id text not null references ${schema}.assistant_threads (thread_id) on delete cascade,
  role text not null,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_assistant_messages_thread_created
  on ${schema}.assistant_messages (thread_id, created_at asc);

create table if not exists ${schema}.assistant_memory_facts (
  memory_fact_id text primary key,
  thread_id text not null references ${schema}.assistant_threads (thread_id) on delete cascade,
  content text not null,
  confidence double precision not null,
  source_message_id text not null references ${schema}.assistant_messages (message_id) on delete cascade,
  source_type text not null,
  created_at timestamptz not null default now(),
  unique (thread_id, content)
);

create index if not exists idx_assistant_memory_facts_thread_created
  on ${schema}.assistant_memory_facts (thread_id, created_at asc);
`;
};
