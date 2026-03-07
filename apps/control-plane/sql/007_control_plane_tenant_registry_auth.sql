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
