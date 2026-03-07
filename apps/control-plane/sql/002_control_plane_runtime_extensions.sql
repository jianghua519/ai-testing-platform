create table if not exists agents (
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
  last_heartbeat_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_agents_tenant_status_updated
  on agents (tenant_id, status, updated_at desc);

create index if not exists idx_agents_project_updated
  on agents (project_id, updated_at desc)
  where project_id is not null;

create table if not exists job_leases (
  lease_id bigserial primary key,
  job_id text not null,
  run_id text null references runs (run_id),
  run_item_id text null references run_items (run_item_id),
  agent_id text not null references agents (agent_id),
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
  on job_leases (job_id)
  where released_at is null;

create index if not exists idx_job_leases_agent_status_expires
  on job_leases (agent_id, status, expires_at asc);

create index if not exists idx_job_leases_run_item_acquired
  on job_leases (run_item_id, acquired_at desc)
  where run_item_id is not null;

create table if not exists artifacts (
  artifact_id text primary key,
  tenant_id text not null,
  project_id text not null,
  run_id text null references runs (run_id),
  run_item_id text null references run_items (run_item_id),
  step_event_id text null references step_events (event_id),
  job_id text null,
  artifact_type text not null,
  storage_uri text not null,
  content_type text null,
  size_bytes bigint null,
  sha256 text null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_artifacts_run_created
  on artifacts (run_id, created_at desc)
  where run_id is not null;

create index if not exists idx_artifacts_run_item_created
  on artifacts (run_item_id, created_at desc)
  where run_item_id is not null;

create index if not exists idx_artifacts_step_event_created
  on artifacts (step_event_id, created_at desc)
  where step_event_id is not null;
