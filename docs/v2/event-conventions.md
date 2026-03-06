---
title: V2 Event Conventions
status: active
owner: architecture
last_updated: 2026-03-06
summary: Normative event envelope, versioning, tenant boundary, and delivery semantics for V2.
---

# V2 Event Conventions

This document is normative.

## Envelope

All events MUST be wrapped in a shared envelope:

- `event_id` (uuid)
- `event_type` (string)
- `schema_version` (string, e.g. `1.0`)
- `occurred_at` (RFC3339)
- `tenant_id` (uuid)
- `project_id` (uuid)
- `trace_id` (string)
- `correlation_id` (string, optional)
- `payload` (object)

## Versioning

- `schema_version` is required on every event.
- Backward compatible changes:
  - add optional fields
  - add new event types
- Breaking changes require a new major (e.g. `2.x`) and dual-consume period.

## Delivery Semantics

Assume at-least-once delivery:

- producers may publish duplicates
- consumers MUST be idempotent

Minimum dedupe:

- every `job.execute_requested` includes `job_dedupe_key`
- consumers persist dedupe keys with TTL and ignore duplicates

## Tenant Boundary

- consumers MUST reject events missing `tenant_id` or `project_id`
- consumers MUST ensure writes are scoped to `(tenant_id, project_id)`

## Error Handling

- poison messages go to a DLQ with reason and original envelope
- never silently drop messages
