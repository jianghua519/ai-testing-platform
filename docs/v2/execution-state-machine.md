---
title: V2 Execution State Machine
status: active
owner: architecture
last_updated: 2026-03-06
summary: Authoritative state machines for runs, run items, jobs, retries, idempotency, and cancellation.
---

# V2 Execution State Machine

This document is normative. Any V2 implementation must remain consistent with it.

## Entities

- `run`: a single execution request for a set of items (cases x data rows x env).
- `run_item`: an individual executable item within a run.
- `job`: an execution unit dispatched to the runner (typically one run_item attempt).

## Run State Machine (authoritative in Control Plane)

States:

- `created`: accepted by API, persisted.
- `queued`: expanded into run_items and queued for dispatch.
- `running`: at least one run_item started.
- `succeeded`: all run_items are terminal and none failed.
- `failed`: terminal, at least one run_item failed (and policy says fail the run).
- `canceling`: cancellation requested; dispatch stops; in-flight jobs may finish or be interrupted.
- `canceled`: terminal after cancellation completes.
- `archived`: optional terminal marker after retention/cleanup policy.

Allowed transitions:

- `created -> queued`
- `queued -> running`
- `running -> succeeded | failed | canceling`
- `queued -> canceling`
- `canceling -> canceled`
- `succeeded | failed | canceled -> archived`

Invariants:

- A run is terminal when in `succeeded | failed | canceled | archived`.
- Terminal runs are immutable except for:
  - post-run metadata (labels, notes)
  - report artifacts and audit events

## RunItem State Machine

States:

- `pending`: created but not dispatched.
- `dispatched`: a job message has been published.
- `running`: runner started.
- `passed`: terminal success.
- `failed`: terminal failure.
- `canceled`: terminal due to run cancellation.

Allowed transitions:

- `pending -> dispatched -> running -> passed | failed`
- `pending | dispatched | running -> canceled` (if run is canceling)

Retry model:

- retries create new `attempt_no` for the same logical run_item.
- the latest terminal attempt determines final `run_item` status, per policy.

## Idempotency and Deduplication (Release Gate)

API idempotency:

- Mutating endpoints accept `Idempotency-Key` header.
- Control Plane stores `(tenant_id, principal_id, route, idempotency_key) -> response_hash`.

Message idempotency:

- Every job has a deterministic dedupe key:
  - `job_dedupe_key = sha256(tenant_id + run_item_id + attempt_no + stage)`
- Consumers must be safe under at-least-once delivery.

## Cancellation Semantics

- Cancel is best-effort. Control Plane guarantees no new dispatch after `canceling`.
- Runner should:
  - periodically poll cancellation token (or receive cancel event)
  - stop safely and report terminal state

## Events (must match AsyncAPI)

Minimum events:

- `run.created`
- `run.queued`
- `run.status_changed`
- `run_item.status_changed`
- `job.execute_requested`
- `job.result_reported`
