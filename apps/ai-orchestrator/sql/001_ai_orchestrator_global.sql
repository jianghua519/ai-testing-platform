create table if not exists tenant_schemas (
  tenant_id text primary key,
  schema_name text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists assistant_thread_locators (
  thread_id text primary key,
  tenant_id text not null,
  project_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_assistant_thread_locators_tenant_project_created
  on assistant_thread_locators (tenant_id, project_id, created_at desc);
