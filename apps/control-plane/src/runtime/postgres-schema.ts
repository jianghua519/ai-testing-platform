export const quotePostgresIdentifier = (value: string): string => `"${value.replace(/"/g, '""')}"`;

export const buildTenantBusinessSchemaSql = (tenantId: string): string => {
  const schema = quotePostgresIdentifier(tenantId);

  return `
create schema if not exists ${schema};

create table if not exists ${schema}.control_plane_runner_events (
  event_id text primary key,
  event_type text not null,
  tenant_id text not null,
  project_id text not null,
  trace_id text not null,
  correlation_id text null,
  job_id text not null,
  run_id text not null,
  run_item_id text not null,
  attempt_no integer not null,
  source_step_id text null,
  status text null,
  envelope_json jsonb not null,
  received_at timestamptz not null default now()
);

create index if not exists idx_control_plane_runner_events_job_received
  on ${schema}.control_plane_runner_events (job_id, received_at, event_id);

create table if not exists ${schema}.runs (
  run_id text primary key,
  tenant_id text not null,
  project_id text not null,
  name text null,
  mode text null,
  status text not null,
  started_at timestamptz null,
  finished_at timestamptz null,
  last_event_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_runs_tenant_project_created
  on ${schema}.runs (tenant_id, project_id, created_at desc);

create table if not exists ${schema}.agents (
  agent_id text primary key,
  tenant_id text not null,
  project_id text null,
  name text not null,
  platform text not null,
  architecture text not null,
  runtime_kind text not null,
  status text not null,
  capabilities_json jsonb not null default '[]'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  max_parallel_slots integer not null default 1,
  last_heartbeat_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_agents_tenant_slots_status
  on ${schema}.agents (tenant_id, status, max_parallel_slots, updated_at desc);

create table if not exists ${schema}.run_items (
  run_item_id text primary key,
  run_id text not null references ${schema}.runs (run_id),
  job_id text not null unique,
  tenant_id text not null,
  project_id text not null,
  attempt_no integer not null,
  status text not null,
  job_kind text not null default 'web',
  required_capabilities_json jsonb not null default '[]'::jsonb,
  job_payload_json jsonb not null default '{}'::jsonb,
  assigned_agent_id text null references ${schema}.agents (agent_id),
  lease_token text null,
  control_state text not null default 'active',
  control_reason text null,
  started_at timestamptz null,
  finished_at timestamptz null,
  last_event_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_run_items_run_attempt
  on ${schema}.run_items (run_id, attempt_no, created_at desc);

create index if not exists idx_run_items_pending_kind_created
  on ${schema}.run_items (job_kind, status, created_at asc)
  where status = 'pending';

create index if not exists idx_run_items_assigned_agent_status
  on ${schema}.run_items (assigned_agent_id, status, updated_at desc)
  where assigned_agent_id is not null;

create index if not exists idx_run_items_required_capabilities_gin
  on ${schema}.run_items
  using gin (required_capabilities_json);

create index if not exists idx_run_items_control_state_status
  on ${schema}.run_items (control_state, status, updated_at desc)
  where control_state <> 'active';

create table if not exists ${schema}.job_leases (
  lease_id bigserial primary key,
  job_id text not null,
  run_id text null references ${schema}.runs (run_id),
  run_item_id text null references ${schema}.run_items (run_item_id),
  agent_id text not null references ${schema}.agents (agent_id),
  lease_token text not null unique,
  attempt_no integer not null default 0,
  status text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  acquired_at timestamptz not null default now(),
  expires_at timestamptz not null,
  heartbeat_at timestamptz null,
  released_at timestamptz null
);

create unique index if not exists uq_job_leases_active_job
  on ${schema}.job_leases (job_id)
  where released_at is null;

create index if not exists idx_job_leases_agent_status_expires
  on ${schema}.job_leases (agent_id, status, expires_at asc);

create index if not exists idx_job_leases_run_item_acquired
  on ${schema}.job_leases (run_item_id, acquired_at desc)
  where run_item_id is not null;

create index if not exists idx_job_leases_active_agent
  on ${schema}.job_leases (agent_id, released_at, expires_at asc)
  where released_at is null;

create table if not exists ${schema}.step_events (
  event_id text primary key references ${schema}.control_plane_runner_events (event_id),
  run_id text not null references ${schema}.runs (run_id),
  run_item_id text not null references ${schema}.run_items (run_item_id),
  job_id text not null,
  tenant_id text not null,
  project_id text not null,
  attempt_no integer not null,
  compiled_step_id text not null,
  source_step_id text not null,
  status text not null,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  duration_ms integer not null,
  error_code text null,
  error_message text null,
  artifacts_json jsonb not null default '[]'::jsonb,
  extracted_variables_json jsonb not null default '[]'::jsonb,
  envelope_json jsonb not null,
  received_at timestamptz not null default now()
);

create index if not exists idx_step_events_run_item_step
  on ${schema}.step_events (run_item_id, source_step_id, received_at desc);

create table if not exists ${schema}.step_decisions (
  decision_id bigserial primary key,
  job_id text not null,
  run_id text null references ${schema}.runs (run_id),
  run_item_id text null references ${schema}.run_items (run_item_id),
  source_step_id text not null,
  action text not null,
  reason text null,
  replacement_step_json jsonb null,
  resume_after_ms integer null,
  enqueued_at timestamptz not null default now(),
  consumed_at timestamptz null
);

create index if not exists idx_step_decisions_pending
  on ${schema}.step_decisions (job_id, source_step_id, consumed_at, decision_id);

create table if not exists ${schema}.artifacts (
  artifact_id text primary key,
  tenant_id text not null,
  project_id text not null,
  run_id text null references ${schema}.runs (run_id),
  run_item_id text null references ${schema}.run_items (run_item_id),
  step_event_id text null references ${schema}.step_events (event_id),
  job_id text null,
  artifact_type text not null,
  storage_uri text not null,
  content_type text null,
  size_bytes bigint null,
  sha256 text null,
  metadata_json jsonb not null default '{}'::jsonb,
  retention_expires_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists idx_artifacts_run_created
  on ${schema}.artifacts (run_id, created_at desc)
  where run_id is not null;

create index if not exists idx_artifacts_run_item_created
  on ${schema}.artifacts (run_item_id, created_at desc)
  where run_item_id is not null;

create index if not exists idx_artifacts_step_event_created
  on ${schema}.artifacts (step_event_id, created_at desc)
  where step_event_id is not null;

create index if not exists idx_artifacts_retention_expires
  on ${schema}.artifacts (retention_expires_at asc, artifact_id asc)
  where retention_expires_at is not null;
`;
};

export const CONTROL_PLANE_GLOBAL_REGISTRY_SQL = `
create table if not exists tenant_schemas (
  tenant_id text primary key,
  schema_name text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists run_locators (
  run_id text primary key,
  tenant_id text not null,
  project_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists run_item_locators (
  run_item_id text primary key,
  run_id text not null,
  job_id text not null unique,
  tenant_id text not null,
  project_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_run_item_locators_run_created
  on run_item_locators (run_id, created_at desc);

create table if not exists artifact_locators (
  artifact_id text primary key,
  run_id text null,
  run_item_id text null,
  tenant_id text not null,
  project_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists agent_locators (
  agent_id text primary key,
  tenant_id text not null,
  project_id text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists lease_locators (
  lease_token text primary key,
  job_id text not null,
  run_id text null,
  run_item_id text null,
  agent_id text not null,
  tenant_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_lease_locators_job
  on lease_locators (job_id, created_at desc);

create table if not exists subject_project_memberships (
  tenant_id text not null,
  subject_id text not null,
  project_id text not null,
  roles_json jsonb not null default '[]'::jsonb,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, subject_id, project_id)
);

create index if not exists idx_subject_project_memberships_subject
  on subject_project_memberships (tenant_id, subject_id, status, project_id);
`;

export const CONTROL_PLANE_POSTGRES_SCHEMA_SQL = buildTenantBusinessSchemaSql('public');
