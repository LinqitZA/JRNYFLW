# UAT Rollout Design — JRNYFLW on `devflw.jrny.co.za`

**Date:** 2026-05-24
**Status:** Approved (design) — pending implementation plan
**Owner:** Aadil Aboobaker

## 1. Goal

Stand up a User Acceptance Testing (UAT) environment for the JRNYFLW fork on a
dedicated domain `devflw.jrny.co.za`, served over HTTPS by the host's existing
nginx reverse proxy. The environment must exercise the custom integration pieces
(`@jrnyflw/jrny`, `@jrnyflw/nucleus`, `@jrnyflw/shoprite`, `@jrnyflw/mapper`,
`@activepieces/piece-data-mapper`) end-to-end with real customer connections
configured by testers.

The UAT VM **also hosts the JRNY ERP** (the integration target). The rollout must
not collide with, or disturb, any ERP container, port, or volume.

## 2. Constraints & decisions

| Topic | Decision |
|---|---|
| Host | Shared UAT VM (JRNY ERP runs on the same box) |
| TLS / domain | Existing host nginx terminates HTTPS for `devflw.jrny.co.za`, proxies plain HTTP to the app on loopback |
| Container topology | **Single all-in-one** `AP_CONTAINER_TYPE=WORKER_AND_APP` app container + Postgres + Redis |
| Data stores | Postgres + Redis as containers in the same compose stack, named volumes |
| Custom pieces | Baked into the image, served from `dist/` via `AP_DEV_PIECES` (file source) |
| Image delivery | Build locally → `docker save` piped over SSH to `docker load` on the VM |
| Admin user | Seeded on first run by a script, then **signup locked** (`emailAuthEnabled=false`) |
| Connections | Configured in-app after login; **no secrets** baked into image/compose |
| File strategy | **New** `Dockerfile.uat` + `docker-compose.uat.yml`; existing build assets untouched |
| Edition | `AP_EDITION=ce`, `AP_ENVIRONMENT=prod` |

### Why these choices
- **All-in-one** minimises moving parts on a shared box; splitting APP/WORKER is
  prod-parity overkill for UAT (YAGNI). Can split later without redesign.
- **No host ports for Postgres/Redis** is the core ERP-coexistence guarantee:
  they are reached only over the internal docker network, so they cannot collide
  with the ERP's 5432/5433/5434/6379/6380. Only the app binds a host port, and
  only on `127.0.0.1` so it is reachable by nginx, never the public internet.
- **File-source pieces** (`AP_DEV_PIECES`) need no registry, no DB sync, and no
  source rebuild at runtime — the loader reads built `dist/` folders and merges
  them into the live piece cache regardless of edition/environment
  (`piece-cache.ts` → `loadDevPiecesIfEnabled` → `loadDistPiecesMetadata`).

## 3. Architecture

```
Internet ──HTTPS──> host nginx (devflw.jrny.co.za, TLS)
                       │ proxy_pass http://127.0.0.1:<APP_HOST_PORT>  (+ ws upgrade)
                       ▼
        ┌─────────── docker network: jrnyflw-uat ───────────┐
        │  jrnyflw-uat-app   (WORKER_AND_APP, container :80) │
        │      │                    │                        │
        │      ▼                    ▼                        │
        │  jrnyflw-uat-postgres  jrnyflw-uat-redis           │
        │  (no host port)        (no host port)              │
        └────────────────────────────────────────────────────┘
              volumes: jrnyflw_uat_pg_data, jrnyflw_uat_redis_data
```

### Port allocation
- **App:** `127.0.0.1:<APP_HOST_PORT>:80`. Proposed `3020`, to be confirmed by a
  pre-deploy inventory on the VM (`ss -ltnp` + `docker ps`). Must be disjoint from
  the ERP (3000, 3001, 5432, 5433, 5434, 6379, 6380, 6432, 9000, 9001, 5005) and
  from any other listener.
- **Postgres / Redis:** no `ports:` mapping at all (internal network only).
- **Container names:** `jrnyflw-uat-app`, `jrnyflw-uat-postgres`, `jrnyflw-uat-redis`
  (distinct from both the dev `jrnyflw-dev-*` stack and the ERP `jrny-dev-*` stack).
- **Network:** `jrnyflw-uat` (dedicated bridge).
- **Volumes:** `jrnyflw_uat_pg_data`, `jrnyflw_uat_redis_data`.

## 4. Components / files to create

### 4.1 `Dockerfile.uat` (new, derived from `Dockerfile`)
The base `Dockerfile` deletes the pieces UAT exists to test. The UAT variant must:
1. **Build** the custom + required pieces. Extend the turbo build filter to include
   `@jrnyflw/jrny`, `@jrnyflw/nucleus`, `@jrnyflw/shoprite`, `@jrnyflw/mapper`,
   `@activepieces/piece-data-mapper`, plus the core/community utility pieces named in
   `AP_DEV_PIECES` (§5).
2. **Keep** (do not `rm -rf`) the `dist/` folders for:
   - the four pieces the API imports at compile time and which must always remain:
     `slack`, `square`, `facebook-leads`, `intercom`
     (`packages/server/api/src/app/trigger/app-event-routing/app-event-routing.module.ts`);
   - every piece listed in `AP_DEV_PIECES`.
   Replace the base image's blanket `rm -rf packages/pieces/core packages/pieces/custom`
   + community trim with a keep-list that retains exactly the set above.
3. **Preserve** the existing migration-manifest generation step (already present for
   image-tag-based rollback).

> Implementation note: `AP_DEV_PIECES` matches on the **folder name** (the loader
> checks paths ending in `/<name>/dist`), not the npm package name. The keep-list and
> the env value both use folder names (`jrny`, `nucleus`, `shoprite`, `mapper`,
> `data-mapper`, …).

### 4.2 `docker-compose.uat.yml` (new)
- `app` (image `jrnyflw-uat:<tag>`), `postgres`, `redis`.
- App: `env_file: .env.uat`, `environment: AP_CONTAINER_TYPE=WORKER_AND_APP`,
  `ports: ["127.0.0.1:${APP_HOST_PORT}:80"]`, `restart: unless-stopped`,
  `depends_on` postgres+redis (with `condition: service_healthy`).
- Postgres/Redis: named volumes, healthchecks, **no host ports**.
- Dedicated network `jrnyflw-uat`.

### 4.3 `.env.uat.example` (new, committed)
Documented template with placeholders. Real `.env.uat` lives only on the VM.
`.gitignore` currently ignores `.env*`; add a `!.env.uat.example` negation so the
template is tracked.

### 4.4 `scripts/uat/seed-admin.sh` (new)
First-run, idempotent:
1. Poll the app health endpoint until ready.
2. If no platform owner exists yet, `POST /api/v1/authentication/sign-up` with
   `AP_UAT_ADMIN_EMAIL` / `AP_UAT_ADMIN_PASSWORD` (becomes platform owner).
3. Authenticate, then disable open registration (`emailAuthEnabled=false`) so only
   the admin can invite testers.
4. No-op cleanly if an owner already exists (safe to re-run).

### 4.5 `nginx/devflw.jrny.co.za.conf` (new, reference)
Reverse-proxy server block for the host nginx:
- `proxy_pass http://127.0.0.1:<APP_HOST_PORT>;`
- WebSocket upgrade headers (`Upgrade` / `Connection`) — flow-run live updates use
  websockets.
- Long read/send timeouts for long-running flow executions.
- Standard forwarded headers (`X-Forwarded-Proto https`, `Host`, `X-Real-IP`).
- TLS handled by the host's existing cert tooling (out of scope to provision here).

## 5. Configuration / secrets (`.env.uat`)

| Key | Value / note |
|---|---|
| `AP_EDITION` | `ce` |
| `AP_ENVIRONMENT` | `prod` (avoids dev-only warnings/watcher; `AP_DEV_PIECES` still serves from dist) |
| `AP_FRONTEND_URL` | `https://devflw.jrny.co.za` |
| `AP_WEBHOOK_URL` | `https://devflw.jrny.co.za` |
| `AP_ENCRYPTION_KEY` | 32-hex, generated **once**, never rotated (rotation breaks stored connections) |
| `AP_JWT_SECRET` | generated **once**, never rotated (rotation invalidates sessions; worker token derives from it) |
| `AP_POSTGRES_HOST` | `postgres` (service name) |
| `AP_POSTGRES_PORT` | `5432` (internal) |
| `AP_POSTGRES_DATABASE` / `_USERNAME` / `_PASSWORD` | UAT-specific creds |
| `AP_REDIS_HOST` | `redis` (service name) |
| `AP_REDIS_PORT` | `6379` (internal) |
| `AP_QUEUE_MODE` | `REDIS` |
| `AP_DB_TYPE` | `POSTGRES` |
| `AP_DEV_PIECES` | `jrny,nucleus,shoprite,mapper,data-mapper` + core utilities used by UAT flows (baseline: `store,webhook,schedule,sftp,subflows,tables,manual-trigger,http,csv,date-helper,delay,forms` — tunable) |
| `AP_PIECES_SYNC_MODE` | `NONE` |
| `AP_TELEMETRY_ENABLED` | `false` |
| `APP_HOST_PORT` | `3020` (pending VM inventory) |
| `AP_UAT_ADMIN_EMAIL` / `AP_UAT_ADMIN_PASSWORD` | consumed only by `seed-admin.sh` |

`AP_WORKER_TOKEN` is auto-generated from `AP_JWT_SECRET` by `docker-entrypoint.sh`.

## 6. Lifecycle / runbook

- **Deploy:**
  1. Build locally: `docker build -f Dockerfile.uat -t jrnyflw-uat:<tag> .`
  2. Transfer: `docker save jrnyflw-uat:<tag> | gzip | ssh <vm> 'gunzip | docker load'`
  3. On VM (first time): create `.env.uat`, run inventory to confirm `APP_HOST_PORT`,
     `docker compose -f docker-compose.uat.yml up -d`, then `scripts/uat/seed-admin.sh`.
  4. Apply `nginx/devflw.jrny.co.za.conf` to the host nginx and reload.
- **Migrations:** run automatically on app boot (TypeORM), unchanged from base image.
- **Update:** new tag → save/load → `up -d` (recreates app; volumes persist).
- **Rollback:** `up -d` pinned to the previous image tag (migration manifest already baked).
- **Reset UAT:** `docker compose -f docker-compose.uat.yml down -v` (wipes UAT
  volumes only) → `up -d` → re-seed. **Never** target ERP containers/volumes.

## 7. Verification

- **Local (pre-transfer):** build `Dockerfile.uat`, boot the stack, confirm
  `GET /api/v1/flags` responds and `GET /api/v1/pieces` lists all five custom pieces.
- **On VM:** browse `https://devflw.jrny.co.za`; log in as the seeded admin; confirm
  self-signup is rejected; add a connection for jrny / shoprite / nucleus; run a
  smoke flow that calls each integration.
- **Coexistence:** confirm all ERP `jrny-dev-*` containers remain untouched
  (`docker ps`) and no port overlap (`ss -ltnp`).
- Run `npm run lint-dev` on any TS touched (none expected — this is infra/config).

## 8. Out of scope

- Provisioning the TLS certificate for `devflw.jrny.co.za` (host nginx already does TLS).
- CI/CD automation of the build→transfer→deploy pipeline (manual for UAT).
- Pre-seeding integration connections or customer data (testers configure in-app).
- Splitting APP/WORKER, autoscaling, or production hardening beyond UAT needs.
- Any change to the JRNY ERP stack.

## 9. Open items to confirm at deploy time

1. `APP_HOST_PORT` free on the VM (proposed `3020`).
2. Final `AP_DEV_PIECES` utility list for the flows UAT testers will build.
3. SSH access + docker permissions on the UAT VM for the `save`/`load` step.
