alter table runs
  add column if not exists selection_kind text null;

create table if not exists test_cases (
  test_case_id text primary key,
  tenant_id text not null,
  project_id text not null,
  data_template_id text not null,
  name text not null,
  status text not null,
  latest_version_id text null,
  latest_published_version_id text null,
  created_by text null,
  updated_by text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_test_cases_data_template_id
  on test_cases (data_template_id);

create index if not exists idx_test_cases_tenant_project_created
  on test_cases (tenant_id, project_id, created_at desc);

create table if not exists data_templates (
  data_template_id text primary key,
  test_case_id text not null references test_cases (test_case_id),
  tenant_id text not null,
  project_id text not null,
  name text not null,
  status text not null,
  latest_version_id text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_data_templates_test_case_id
  on data_templates (test_case_id);

create table if not exists data_template_versions (
  data_template_version_id text primary key,
  data_template_id text not null references data_templates (data_template_id),
  test_case_id text not null references test_cases (test_case_id),
  tenant_id text not null,
  project_id text not null,
  version_no integer not null,
  schema_json jsonb not null default '{"fields":[]}'::jsonb,
  validation_rules_json jsonb not null default '{}'::jsonb,
  created_by text null,
  created_at timestamptz not null default now(),
  unique (data_template_id, version_no)
);

create index if not exists idx_data_template_versions_case_created
  on data_template_versions (test_case_id, created_at desc);

create table if not exists test_case_versions (
  test_case_version_id text primary key,
  test_case_id text not null references test_cases (test_case_id),
  tenant_id text not null,
  project_id text not null,
  version_no integer not null,
  version_label text null,
  status text not null,
  plan_json jsonb not null,
  env_profile_json jsonb not null,
  data_template_id text not null references data_templates (data_template_id),
  data_template_version_id text not null references data_template_versions (data_template_version_id),
  source_recording_id text null,
  source_run_id text null,
  derived_from_case_version_id text null,
  change_summary text null,
  created_by text null,
  created_at timestamptz not null default now(),
  unique (test_case_id, version_no)
);

create index if not exists idx_test_case_versions_case_created
  on test_case_versions (test_case_id, created_at desc);

create table if not exists dataset_rows (
  dataset_row_id text primary key,
  data_template_version_id text not null references data_template_versions (data_template_version_id),
  test_case_id text not null references test_cases (test_case_id),
  tenant_id text not null,
  project_id text not null,
  name text not null,
  status text not null,
  values_json jsonb not null default '{}'::jsonb,
  created_by text null,
  updated_by text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_dataset_rows_template_created
  on dataset_rows (data_template_version_id, created_at desc);

create table if not exists case_default_dataset_bindings (
  test_case_version_id text primary key references test_case_versions (test_case_version_id),
  dataset_row_id text not null references dataset_rows (dataset_row_id),
  tenant_id text not null,
  project_id text not null,
  bound_at timestamptz not null default now(),
  bound_by text null
);

alter table run_items
  add column if not exists test_case_id text null references test_cases (test_case_id),
  add column if not exists test_case_version_id text null references test_case_versions (test_case_version_id),
  add column if not exists data_template_version_id text null references data_template_versions (data_template_version_id),
  add column if not exists dataset_row_id text null references dataset_rows (dataset_row_id),
  add column if not exists input_snapshot_json jsonb not null default '{}'::jsonb,
  add column if not exists source_recording_id text null;

create table if not exists test_case_locators (
  test_case_id text primary key,
  tenant_id text not null,
  project_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists test_case_version_locators (
  test_case_version_id text primary key,
  test_case_id text not null,
  tenant_id text not null,
  project_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_test_case_version_locators_case_created
  on test_case_version_locators (test_case_id, created_at desc);

create table if not exists data_template_locators (
  data_template_id text primary key,
  test_case_id text not null,
  tenant_id text not null,
  project_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists data_template_version_locators (
  data_template_version_id text primary key,
  data_template_id text not null,
  test_case_id text not null,
  tenant_id text not null,
  project_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_data_template_version_locators_template_created
  on data_template_version_locators (data_template_id, created_at desc);

create table if not exists dataset_row_locators (
  dataset_row_id text primary key,
  data_template_version_id text not null,
  test_case_id text not null,
  tenant_id text not null,
  project_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_dataset_row_locators_template_created
  on dataset_row_locators (data_template_version_id, created_at desc);
