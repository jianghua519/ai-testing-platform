alter table run_items
  add column if not exists required_capabilities_json jsonb not null default '[]'::jsonb;

create index if not exists idx_run_items_required_capabilities_gin
  on run_items
  using gin (required_capabilities_json);
