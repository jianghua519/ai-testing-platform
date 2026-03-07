---
title: V2 API Conventions
status: active
owner: architecture
last_updated: 2026-03-07
summary: Normative REST API conventions for versioning, headers, errors, pagination, and idempotency.
---

# V2 API Conventions

This document is normative.

## Versioning

- Base path uses `/api/v1` for the first V2 contract major. Backward compatible changes are allowed within `1.x`.
- Breaking changes require a new major version (new base path and new OpenAPI version).

## Required Headers

All authenticated requests:

- `Authorization: Bearer <JWT>`

Tenant scoping:

- Prefer stable identity claims from the token as the source of truth for `subject_id` and `tenant_id`.
- Project selection and role checks may be resolved from the server-side authorization store when those grants are mutable.
- If explicit headers are used, they must match token claims:
  - `X-Tenant-Id: <uuid>`
  - `X-Project-Id: <uuid>`

Tracing:

- Client may send `X-Request-Id: <string>`; server echoes it back.
- Server always returns:
  - `X-Request-Id`
  - `X-Trace-Id`

Idempotency:

- Mutating endpoints accept `Idempotency-Key: <string>`.

## Error Model

All non-2xx responses return:

```json
{
  "error": {
    "code": "TENANT_SCOPE_MISMATCH",
    "message": "tenant scope mismatch",
    "trace_id": "trace-123",
    "details": { "field": "tenant_id" }
  }
}
```

Rules:

- `code` is stable and machine-readable.
- `message` is safe for end users (no secrets).
- `details` is optional and may contain structured fields.

## Standard Status Codes

- `400` invalid request payload or query.
- `401` unauthenticated.
- `403` unauthorized (RBAC/tenant boundary).
- `404` not found (within tenant/project scope).
- `409` conflict (e.g. state transition invalid).
- `429` rate limit or quota exceeded.
- `500` unexpected server error.

## Pagination (Cursor)

List responses:

- request: `?limit=<int>&cursor=<string>`
- response: `items[]` + `next_cursor` (omit or empty when end)

Cursor must be opaque to clients.

## Idempotency Semantics

- If the same `(principal, route, idempotency_key)` is replayed:
  - return the original response body and status code
  - do not trigger a second side effect
- Idempotency retention: minimum 24 hours (configurable).
