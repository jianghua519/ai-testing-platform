alter table agents
  add column if not exists max_parallel_slots integer not null default 1;

alter table run_items
  add column if not exists control_state text not null default 'active',
  add column if not exists control_reason text null;

create index if not exists idx_agents_tenant_slots_status
  on agents (tenant_id, status, max_parallel_slots, updated_at desc);

create index if not exists idx_run_items_control_state_status
  on run_items (control_state, status, updated_at desc)
  where control_state <> 'active';
