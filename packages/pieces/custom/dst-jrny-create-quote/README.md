# @jrnyflw/dst-jrny-create-quote

JRNYFLW segment for creating quotations in JRNY ERP.

## Overview

Single destination (action): `create_quote` — POSTs to JRNY's integration API and returns the created quotation. Optionally auto-converts to a draft sales order.

Auth uses a tenant-issued bearer token, scoped to a single JRNY entity. Cross-entity calls are rejected by the JRNY API guard.

## Auth shape

| Field | Type | Notes |
|---|---|---|
| `baseUrl` | text | JRNY API root (no trailing slash), e.g. `http://localhost:4200/api` |
| `entityId` | text | UUID of the JRNY entity this connection is bound to |
| `entityCode` | text | Display label, e.g. `ZA01` |
| `bearerToken` | secret | Plaintext token issued by a JRNY administrator |

## Action: `create_quote`

POSTs to `${baseUrl}/v1/integration/entities/${entityId}/quotations` with `Authorization: Bearer ${bearerToken}`.

See `docs/audits/JRNY-SIDE-INTEGRATION-SPEC-V0.md` and the addendum for the full request/response contract.

## Build

```
bun install               # at repo root, populates workspace symlinks
bunx turbo run build --filter=@jrnyflw/dst-jrny-create-quote
```

## Dev mode requirements

This segment is only exposed in JRNYFLW dev mode if `dst-jrny-create-quote` (the stripped package name, matching the directory name) is listed in the `AP_DEV_PIECES` env var (in `.env.dev`). Both the dev-piece-watcher and the worker piece-installer match against this name; missing it causes the engine's auth-validation step to attempt an `npm install` and 404.

`turbo.json` must also declare `"globalEnv": ["AP_DEV_PIECES"]` so the value reaches sub-tasks under Turbo 2.x.

## Smoke test

See `docs/audits/SMOKE-TEST-PLAYBOOK.md`.
