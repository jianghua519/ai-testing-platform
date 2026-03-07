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

create table if not exists ${schema}.exploration_sessions (
  exploration_id text primary key,
  tenant_id text not null,
  project_id text not null,
  thread_id text null references ${schema}.assistant_threads (thread_id) on delete set null,
  user_id text null,
  status text not null,
  execution_mode text not null,
  name text null,
  instruction text not null,
  start_url text not null,
  recording_id text null,
  output_dir text null,
  summary text null,
  last_snapshot_markdown text null,
  sample_dataset_json jsonb not null default '{}'::jsonb,
  artifacts_json jsonb not null default '[]'::jsonb,
  created_test_case_id text null,
  created_test_case_version_id text null,
  default_dataset_row_id text null,
  started_at timestamptz null,
  finished_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_exploration_sessions_tenant_project_updated
  on ${schema}.exploration_sessions (tenant_id, project_id, updated_at desc);

create table if not exists ${schema}.self_heal_attempts (
  self_heal_attempt_id text primary key,
  tenant_id text not null,
  project_id text not null,
  run_id text not null,
  run_item_id text not null,
  failed_step_event_id text null,
  source_step_id text not null,
  failure_category text not null,
  strategy_summary text not null,
  explanation text null,
  override_json jsonb null,
  replay_run_id text null,
  replay_run_status text null,
  derived_test_case_version_id text null,
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_self_heal_attempts_tenant_project_created
  on ${schema}.self_heal_attempts (tenant_id, project_id, created_at desc);

create table if not exists ${schema}.run_evaluations (
  run_evaluation_id text primary key,
  tenant_id text not null,
  project_id text not null,
  run_id text not null,
  run_item_id text not null,
  verdict text not null,
  deterministic_summary_json jsonb not null default '{}'::jsonb,
  explanation text not null,
  evidence_json jsonb not null default '[]'::jsonb,
  linked_artifact_ids_json jsonb not null default '[]'::jsonb,
  self_heal_attempt_id text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_run_evaluations_tenant_project_created
  on ${schema}.run_evaluations (tenant_id, project_id, created_at desc);
`;
};
