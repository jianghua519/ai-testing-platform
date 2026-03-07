alter table artifacts
  add column if not exists retention_expires_at timestamptz null;

create index if not exists idx_artifacts_retention_expires
  on artifacts (retention_expires_at asc, artifact_id asc)
  where retention_expires_at is not null;
