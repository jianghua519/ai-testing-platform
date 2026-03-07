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

create table if not exists control_plane_step_decisions (
  decision_id bigserial primary key,
  job_id text not null,
  source_step_id text not null,
  action text not null,
  reason text null,
  replacement_step_json jsonb null,
  resume_after_ms integer null,
  enqueued_at timestamptz not null default now(),
  consumed_at timestamptz null
);

create index if not exists idx_control_plane_step_decisions_pending
  on control_plane_step_decisions (job_id, source_step_id, consumed_at, decision_id);
