create table if not exists recording_locators (
  recording_id text primary key,
  tenant_id text not null,
  project_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
declare
  tenant_schema text;
begin
  for tenant_schema in
    select schema_name
    from tenant_schemas
  loop
    execute format(
      'create table if not exists %I.recordings (
         recording_id text primary key,
         tenant_id text not null,
         project_id text not null,
         name text not null,
         status text not null,
         source_type text not null,
         env_profile_json jsonb not null,
         started_at timestamptz not null,
         finished_at timestamptz null,
         created_by text null,
         created_at timestamptz not null default now(),
         updated_at timestamptz not null default now()
       )',
      tenant_schema
    );

    execute format(
      'create index if not exists %I on %I.recordings (tenant_id, project_id, created_at desc)',
      'idx_recordings_tenant_project_created',
      tenant_schema
    );

    execute format(
      'create table if not exists %I.recording_events (
         recording_event_id text primary key,
         recording_id text not null references %I.recordings (recording_id),
         seq_no integer not null,
         event_type text not null,
         page_url text null,
         locator_json jsonb null,
         payload_json jsonb not null default ''{}''::jsonb,
         captured_at timestamptz not null,
         created_at timestamptz not null default now(),
         unique (recording_id, seq_no)
       )',
      tenant_schema,
      tenant_schema
    );

    execute format(
      'create index if not exists %I on %I.recording_events (recording_id, seq_no asc)',
      'idx_recording_events_recording_seq',
      tenant_schema
    );

    execute format(
      'create table if not exists %I.recording_analysis_jobs (
         recording_analysis_job_id text primary key,
         recording_id text not null references %I.recordings (recording_id),
         tenant_id text not null,
         project_id text not null,
         status text not null,
         dsl_plan_json jsonb null,
         structured_plan_json jsonb not null default ''{}''::jsonb,
         data_template_draft_json jsonb not null default ''{"fields":[]}''::jsonb,
         started_at timestamptz not null,
         finished_at timestamptz null,
         created_by text null,
         created_at timestamptz not null default now()
       )',
      tenant_schema,
      tenant_schema
    );

    execute format(
      'create index if not exists %I on %I.recording_analysis_jobs (recording_id, created_at desc)',
      'idx_recording_analysis_jobs_recording_created',
      tenant_schema
    );
  end loop;
end $$;
