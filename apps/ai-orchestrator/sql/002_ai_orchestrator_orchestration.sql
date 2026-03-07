create table if not exists exploration_session_locators (
  exploration_id text primary key,
  tenant_id text not null,
  project_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_exploration_session_locators_tenant_project_created
  on exploration_session_locators (tenant_id, project_id, created_at desc);

create table if not exists self_heal_attempt_locators (
  self_heal_attempt_id text primary key,
  tenant_id text not null,
  project_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_self_heal_attempt_locators_tenant_project_created
  on self_heal_attempt_locators (tenant_id, project_id, created_at desc);

create table if not exists run_evaluation_locators (
  run_evaluation_id text primary key,
  tenant_id text not null,
  project_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_run_evaluation_locators_tenant_project_created
  on run_evaluation_locators (tenant_id, project_id, created_at desc);
