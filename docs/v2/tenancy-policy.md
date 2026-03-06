---
title: V2 Tenancy Boundary Policy
status: active
owner: architecture
last_updated: 2026-03-06
summary: Normative tenant and project isolation rules for API, storage, events, and audit data.
---

# V2 Tenancy Boundary Policy

This document is normative. Any V2 implementation must remain consistent with it.

## Tenant Model

Hierarchy:

- Organization (optional for initial release)
- Tenant (security boundary)
- Project (configuration + quotas + integrations boundary)

Identifiers:

- `tenant_id` is mandatory on all business entities.
- `project_id` is mandatory on project-scoped entities (runs, assets, reports).

## Request Authentication and Tenant Context

Rules:

- All authenticated requests resolve to a `principal` that includes:
  - `subject_id`
  - `tenant_id`
  - `project_ids` (or a current `project_id`)
  - `roles` / `permissions`
- APIs must reject any request that attempts to:
  - access a different `tenant_id`
  - access a `project_id` not granted to the principal

Preferred mechanism:

- `Authorization: Bearer <token>` is the single source of truth.
- Explicit tenant headers are allowed only for operational tools, and must be consistent with token claims.

## Data Access Enforcement

Minimum enforcement (required):

- A server-side middleware injects `tenant_id` and `project_id` into request context.
- Repository/query layer requires context and automatically scopes all queries by `(tenant_id, project_id?)`.
- Raw SQL access to business tables is forbidden in handlers; only repositories may query.

Additional enforcement (recommended for higher assurance):

- PostgreSQL Row Level Security (RLS) on core business tables:
  - Define `app.tenant_id` as a session variable.
  - Policies enforce `tenant_id = current_setting('app.tenant_id')`.

## Event and Message Boundaries

All events/messages must carry:

- `tenant_id`, `project_id`
- `trace_id`
- `schema_version`

Queue routing guidance:

- Prefer per-tenant routing keys or headers (do not create one queue per tenant by default).
- Consumers must validate tenant context and never write cross-tenant state.

## Object Storage Boundaries

Object key prefix must include `tenant_id`:

- `tenant/<tenant_id>/project/<project_id>/<artifact_type>/<uuid>.<ext>`

Download must use:

- signed URLs with expiry
- access checks against the requesting principal

## Audit and Retention

Audit events are append-only and must include:

- `tenant_id`, `project_id`
- actor: `subject_id` (and actor type)
- action and resource identifiers
- before/after hashes (or payloads if permitted)

Retention policy must be configurable per tenant:

- evidence retention (screenshots/videos/traces)
- audit retention (typically longer)

## Test Requirements (Release Gate)

- Cross-tenant access tests must fail (read/write) for all core endpoints.
- Storage access tests must prevent downloading artifacts from other tenants/projects.
- Event consumer tests must reject events missing `tenant_id` or with mismatched scope.
