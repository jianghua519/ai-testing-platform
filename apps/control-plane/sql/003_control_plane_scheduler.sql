alter table runs
  add column if not exists name text null,
  add column if not exists mode text null;

alter table run_items
  add column if not exists job_kind text not null default 'web',
  add column if not exists job_payload_json jsonb not null default '{}'::jsonb,
  add column if not exists assigned_agent_id text null references agents (agent_id),
  add column if not exists lease_token text null;

create index if not exists idx_run_items_pending_kind_created
  on run_items (job_kind, status, created_at asc)
  where status = 'pending';

create index if not exists idx_run_items_assigned_agent_status
  on run_items (assigned_agent_id, status, updated_at desc)
  where assigned_agent_id is not null;

create index if not exists idx_job_leases_active_agent
  on job_leases (agent_id, released_at, expires_at asc)
  where released_at is null;
