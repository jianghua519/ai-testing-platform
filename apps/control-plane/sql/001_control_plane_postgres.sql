create table if not exists control_plane_runner_events (
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
  on control_plane_runner_events (job_id, received_at, event_id);

create table if not exists runs (
  run_id text primary key,
  tenant_id text not null,
  project_id text not null,
  status text not null,
  started_at timestamptz null,
  finished_at timestamptz null,
  last_event_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_runs_tenant_project_created
  on runs (tenant_id, project_id, created_at desc);

create table if not exists run_items (
  run_item_id text primary key,
  run_id text not null references runs (run_id),
  job_id text not null unique,
  tenant_id text not null,
  project_id text not null,
  attempt_no integer not null,
  status text not null,
  started_at timestamptz null,
  finished_at timestamptz null,
  last_event_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_run_items_run_attempt
  on run_items (run_id, attempt_no, created_at desc);

create table if not exists step_events (
  event_id text primary key references control_plane_runner_events (event_id),
  run_id text not null references runs (run_id),
  run_item_id text not null references run_items (run_item_id),
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
  on step_events (run_item_id, source_step_id, received_at desc);

create table if not exists step_decisions (
  decision_id bigserial primary key,
  job_id text not null,
  run_id text null references runs (run_id),
  run_item_id text null references run_items (run_item_id),
  source_step_id text not null,
  action text not null,
  reason text null,
  replacement_step_json jsonb null,
  resume_after_ms integer null,
  enqueued_at timestamptz not null default now(),
  consumed_at timestamptz null
);

create index if not exists idx_step_decisions_pending
  on step_decisions (job_id, source_step_id, consumed_at, decision_id);
