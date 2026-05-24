# JRNYFLW UAT Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-contained UAT image + compose stack that runs the JRNYFLW fork (with all custom pieces) on the shared ERP VM, served over HTTPS at `devflw.jrny.co.za`.

**Architecture:** A single all-in-one `WORKER_AND_APP` app container plus Postgres and Redis on a private docker network. Postgres/Redis expose no host ports (ERP coexistence); only the app binds `127.0.0.1:3020`, which the host's existing nginx reverse-proxies for TLS. Custom pieces are built into the image and served from their `dist/` folders via `AP_DEV_PIECES`.

**Tech Stack:** Docker / docker-compose, Bun + Turbo build, Activepieces CE server, bash, nginx.

**Spec:** `docs/superpowers/specs/2026-05-24-uat-rollout-design.md`

**Conventions for this plan:**
- Tasks 1–6 are **local/safe** (run on the dev machine, no contact with the UAT VM).
- Tasks 7–8 are the **deploy runbook** — they touch the real UAT VM and must be run by/with the user. Do not execute them autonomously.
- `AP_DEV_PIECES` and the loader match on **folder name**, not npm package name.
- The canonical piece set served in UAT:
  `jrny,nucleus,shoprite,mapper,excel,data-mapper,store,webhook,schedule,sftp,subflows,tables,manual-trigger,http,csv,date-helper,delay,forms`
  (5 first-party custom pieces + `data-mapper` + core utility pieces UAT flows need).

---

## File structure

| File | Responsibility |
|---|---|
| `.gitignore` (modify) | Allow committing `.env.uat.example` while still ignoring real `.env*` |
| `.env.uat.example` (create) | Documented config template; real `.env.uat` lives only on the VM |
| `Dockerfile.uat` (create) | Build image that **keeps** custom + core pieces (base `Dockerfile` deletes them) |
| `docker-compose.uat.yml` (create) | app + postgres + redis, private network, named volumes, no DB host ports |
| `scripts/uat/seed-admin.sh` (create) | First-run: create platform owner, then lock open signup. Idempotent. |
| `scripts/uat/deploy.sh` (create) | Build locally → `docker save`/`load` over SSH → `compose up` → seed |
| `nginx/devflw.jrny.co.za.conf` (create) | Host nginx reverse-proxy block (TLS + websockets) — reference, applied on VM |

---

## Task 1: Track the env template, ignore the real env

**Files:**
- Modify: `.gitignore` (the `.env*` line, currently line 69)
- Create: `.env.uat.example`

- [ ] **Step 1: Add a negation for the example file to `.gitignore`**

Find the existing line:
```
.env*
```
Add immediately below it:
```
!.env.uat.example
```

- [ ] **Step 2: Create `.env.uat.example`**

```dotenv
# ─────────────────────────────────────────────────────────────────────────────
# JRNYFLW UAT environment — copy to .env.uat on the UAT VM and fill in secrets.
# .env.uat is gitignored. NEVER commit real secrets.
# Generate secrets ONCE and never rotate them (rotation breaks stored
# connections and invalidates sessions):
#   AP_ENCRYPTION_KEY:  openssl rand -hex 16   (32 hex chars)
#   AP_JWT_SECRET:      openssl rand -hex 32
# ─────────────────────────────────────────────────────────────────────────────

# --- Edition / environment ---
AP_EDITION=ce
AP_ENVIRONMENT=prod

# --- Public URLs (TLS terminated by host nginx) ---
AP_FRONTEND_URL=https://devflw.jrny.co.za
AP_WEBHOOK_URL=https://devflw.jrny.co.za

# --- Host port the app binds on loopback (nginx upstream). Confirmed free 2026-05-24. ---
APP_HOST_PORT=3020

# --- Image tag selected at deploy time ---
UAT_IMAGE_TAG=latest

# --- Secrets (generate once, see header) ---
AP_ENCRYPTION_KEY=REPLACE_WITH_openssl_rand_hex_16
AP_JWT_SECRET=REPLACE_WITH_openssl_rand_hex_32

# --- Database (internal docker network only; no host port) ---
AP_DB_TYPE=POSTGRES
AP_POSTGRES_HOST=postgres
AP_POSTGRES_PORT=5432
AP_POSTGRES_DATABASE=jrnyflw_uat
AP_POSTGRES_USERNAME=jrnyflw_uat
AP_POSTGRES_PASSWORD=REPLACE_WITH_A_STRONG_PASSWORD
AP_POSTGRES_USE_SSL=false

# --- Queue / Redis (internal docker network only; no host port) ---
AP_QUEUE_MODE=REDIS
AP_REDIS_HOST=redis
AP_REDIS_PORT=6379

# --- Pieces: served from baked-in dist folders (folder names) ---
AP_DEV_PIECES=jrny,nucleus,shoprite,mapper,excel,data-mapper,store,webhook,schedule,sftp,subflows,tables,manual-trigger,http,csv,date-helper,delay,forms
AP_PIECES_SYNC_MODE=NONE

# --- Misc ---
AP_TELEMETRY_ENABLED=false

# --- Consumed ONLY by scripts/uat/seed-admin.sh (not by the server) ---
AP_UAT_ADMIN_EMAIL=admin@jrny.co.za
AP_UAT_ADMIN_PASSWORD=REPLACE_WITH_A_STRONG_ADMIN_PASSWORD
AP_UAT_ADMIN_FIRST_NAME=JRNYFLW
AP_UAT_ADMIN_LAST_NAME=Admin
```

- [ ] **Step 3: Verify the example is now trackable and the real file is not**

Run:
```bash
git check-ignore -v .env.uat.example; echo "example exit: $?"
git check-ignore -v .env.uat; echo "real exit: $?"
```
Expected: `.env.uat.example` → exit `1` (NOT ignored). `.env.uat` → printed match, exit `0` (ignored).

- [ ] **Step 4: Commit**

```bash
git add .gitignore .env.uat.example
git commit -m "feat(uat): env template + gitignore negation for .env.uat.example"
```

---

## Task 2: Create `Dockerfile.uat`

**Files:**
- Create: `Dockerfile.uat` (derived from `Dockerfile`)

The base `Dockerfile` (a) never builds the custom/core pieces and (b) deletes `packages/pieces/core` + `packages/pieces/custom` and trims community to 4 pieces. `Dockerfile.uat` adds path-glob build filters for all custom + core pieces and changes the trim to keep them, removing only the bulk of `community/` (keeping the 4 the API imports at compile time).

- [ ] **Step 1: Create `Dockerfile.uat` with this exact content**

```dockerfile
FROM node:24.14.0-bullseye-slim AS base

# Set environment variables early for better layer caching
ENV LANG=en_US.UTF-8 \
    LANGUAGE=en_US:en \
    LC_ALL=en_US.UTF-8

# Install all system dependencies in a single layer with cache mounts
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && \
    apt-get install -y --no-install-recommends \
        openssh-client \
        python3 \
        g++ \
        build-essential \
        git \
        poppler-utils \
        poppler-data \
        procps \
        locales \
        unzip \
        curl \
        ca-certificates \
        iptables \
        libcap-dev && \
    yarn config set python /usr/bin/python3 && \
    sed -i '/en_US.UTF-8/s/^# //g' /etc/locale.gen && \
    locale-gen en_US.UTF-8

RUN export ARCH=$(uname -m) && \
    if [ "$ARCH" = "x86_64" ]; then \
      curl -fSL https://github.com/oven-sh/bun/releases/download/bun-v1.3.1/bun-linux-x64-baseline.zip -o bun.zip; \
    elif [ "$ARCH" = "aarch64" ]; then \
      curl -fSL https://github.com/oven-sh/bun/releases/download/bun-v1.3.1/bun-linux-aarch64.zip -o bun.zip; \
    fi

RUN unzip bun.zip \
    && mv bun-*/bun /usr/local/bin/bun \
    && chmod +x /usr/local/bin/bun \
    && rm -rf bun.zip bun-*

RUN bun --version

# Install global npm packages in a single layer
RUN --mount=type=cache,target=/root/.npm \
    npm install -g --no-fund --no-audit \
    node-gyp \
    npm@11.11.0 \
    pm2@6.0.10 \
    typescript@4.9.4 \
    esbuild@0.25.0

# Install isolated-vm globally (needed for sandboxes)
RUN --mount=type=cache,target=/root/.bun/install/cache \
    cd /usr/src && bun install isolated-vm@6.0.2

### STAGE 1: Build ###
FROM base AS build

WORKDIR /usr/src/app

# Copy dependency files and workspace package.json files for resolution
COPY .npmrc package.json bun.lock bunfig.toml ./
COPY packages/ ./packages/

# Install all dependencies with frozen lockfile
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

# Copy remaining source code (turbo config, etc.)
COPY . .

# Build frontend, engine, server API, worker, AND all custom + core pieces.
# The 4 community pieces the API imports (slack/square/facebook-leads/intercom)
# build transitively as `api` dependencies.
RUN npx turbo run build \
      --filter=web \
      --filter=@activepieces/engine \
      --filter=api \
      --filter=worker \
      --filter='./packages/pieces/custom/*' \
      --filter='./packages/pieces/core/*'

# Generate migration manifest (ordered list of migration names) for image-tag-based rollback
RUN node -e "\
  const {getMigrations} = require('./packages/server/api/dist/src/app/database/postgres-connection');\
  const names = getMigrations().map(M => new M().name);\
  process.stdout.write(JSON.stringify(names));\
" > packages/server/api/dist/src/migration-manifest.json

# Trim ONLY community pieces down to the 4 the API imports at compile time.
# Keep all of packages/pieces/core and packages/pieces/custom (their dist folders
# are served at runtime via AP_DEV_PIECES). Then regenerate bun.lock to match.
RUN find packages/pieces/community -mindepth 1 -maxdepth 1 -type d \
      ! -name slack \
      ! -name square \
      ! -name facebook-leads \
      ! -name intercom \
      -exec rm -rf {} + && \
    rm -f bun.lock && bun install

### STAGE 2: Run ###
FROM base AS run

WORKDIR /usr/src/app

# Copy static configuration files first (better layer caching)
COPY --from=build /usr/src/app/packages/server/api/src/assets/default.cf /usr/local/etc/isolate
COPY docker-entrypoint.sh .

# Create all necessary directories in one layer
RUN mkdir -p \
    /usr/src/app/dist/packages/engine && \
    chmod +x docker-entrypoint.sh

# Copy root config files needed for dependency resolution
COPY --from=build /usr/src/app/package.json ./
COPY --from=build /usr/src/app/.npmrc ./
COPY --from=build /usr/src/app/bun.lock ./
COPY --from=build /usr/src/app/bunfig.toml ./
COPY --from=build /usr/src/app/LICENSE .

# Copy workspace package.json files (needed for bun workspace resolution)
COPY --from=build /usr/src/app/packages ./packages

# Copy built engine
COPY --from=build /usr/src/app/dist/packages/engine/ ./dist/packages/engine/

# Regenerate lockfile and install production dependencies (pieces were trimmed from workspace)
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --production

# Copy frontend files
COPY --from=build /usr/src/app/dist/packages/web ./dist/packages/web/

LABEL service=activepieces

ENTRYPOINT ["./docker-entrypoint.sh"]
EXPOSE 80
```

- [ ] **Step 2: Sanity-check the only two divergences from the base `Dockerfile`**

Run:
```bash
diff <(grep -vE '^\s*#' Dockerfile) <(grep -vE '^\s*#' Dockerfile.uat)
```
Expected: differences appear in exactly two regions — the `turbo run build` filter list (added custom/core path filters) and the trim block (`rm -rf packages/pieces/core packages/pieces/custom` removed; community-only trim retained). No other lines differ.

- [ ] **Step 3: Commit**

```bash
git add Dockerfile.uat
git commit -m "feat(uat): Dockerfile.uat that bakes in custom + core pieces"
```

---

## Task 3: Create `docker-compose.uat.yml`

**Files:**
- Create: `docker-compose.uat.yml`

Postgres/Redis interpolation values (`${AP_POSTGRES_*}`, `${APP_HOST_PORT}`) come from compose's `--env-file .env.uat` flag (used in every compose command). The app additionally gets the **full** AP_ set via `env_file:`.

- [ ] **Step 1: Create `docker-compose.uat.yml` with this exact content**

```yaml
services:
  app:
    image: jrnyflw-uat:${UAT_IMAGE_TAG:-latest}
    container_name: jrnyflw-uat-app
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    env_file: .env.uat
    environment:
      - AP_CONTAINER_TYPE=WORKER_AND_APP
    ports:
      - "127.0.0.1:${APP_HOST_PORT:-3020}:80"
    volumes:
      - jrnyflw_uat_cache:/usr/src/app/cache
    networks:
      - jrnyflw-uat

  postgres:
    image: pgvector/pgvector:0.8.0-pg14
    container_name: jrnyflw-uat-postgres
    restart: unless-stopped
    environment:
      - POSTGRES_DB=${AP_POSTGRES_DATABASE}
      - POSTGRES_USER=${AP_POSTGRES_USERNAME}
      - POSTGRES_PASSWORD=${AP_POSTGRES_PASSWORD}
    volumes:
      - jrnyflw_uat_pg_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${AP_POSTGRES_USERNAME} -d ${AP_POSTGRES_DATABASE}"]
      interval: 5s
      timeout: 5s
      retries: 12
    networks:
      - jrnyflw-uat

  redis:
    image: redis:7.0.7
    container_name: jrnyflw-uat-redis
    restart: unless-stopped
    volumes:
      - jrnyflw_uat_redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 12
    networks:
      - jrnyflw-uat

volumes:
  jrnyflw_uat_pg_data:
  jrnyflw_uat_redis_data:
  jrnyflw_uat_cache:

networks:
  jrnyflw-uat:
    name: jrnyflw-uat
```

- [ ] **Step 2: Validate compose syntax + interpolation**

Run (from a dir where a filled `.env.uat` exists, or temporarily `cp .env.uat.example .env.uat` for the check):
```bash
cp .env.uat.example .env.uat
docker compose --env-file .env.uat -f docker-compose.uat.yml config >/dev/null && echo "compose OK"
rm -f .env.uat
```
Expected: `compose OK`, no "variable is not set" warnings for `APP_HOST_PORT`, `AP_POSTGRES_DATABASE`, `AP_POSTGRES_USERNAME`, `AP_POSTGRES_PASSWORD`.

- [ ] **Step 3: Commit**

```bash
git add docker-compose.uat.yml
git commit -m "feat(uat): docker-compose stack (app + pg + redis, no DB host ports)"
```

---

## Task 4: Create `scripts/uat/seed-admin.sh`

**Files:**
- Create: `scripts/uat/seed-admin.sh`

Idempotent first-run seeding. Uses only `curl`, `grep`, `sed` (no node/jq dependency on the host). Reads admin creds from env (exported from `.env.uat`).

- [ ] **Step 1: Create `scripts/uat/seed-admin.sh` with this exact content**

```bash
#!/usr/bin/env bash
set -euo pipefail
umask 077

# Seeds the platform owner on a fresh UAT install, then locks open registration.
# Idempotent: if sign-up is rejected (owner already exists / auth disabled), exits 0.
# Depends only on curl, grep, sed. Run with .env.uat exported into the environment:
#   set -a && . ./.env.uat && set +a && bash scripts/uat/seed-admin.sh
# NOTE: AP_UAT_ADMIN_PASSWORD must not contain a double-quote (") or backslash (\),
#       because the JSON request body is assembled without a JSON encoder (no jq on host).

BASE_URL="${UAT_BASE_URL:-http://127.0.0.1:${APP_HOST_PORT:-3020}}"
ADMIN_EMAIL="${AP_UAT_ADMIN_EMAIL:?set AP_UAT_ADMIN_EMAIL}"
ADMIN_PASSWORD="${AP_UAT_ADMIN_PASSWORD:?set AP_UAT_ADMIN_PASSWORD}"
ADMIN_FIRST_NAME="${AP_UAT_ADMIN_FIRST_NAME:-JRNYFLW}"
ADMIN_LAST_NAME="${AP_UAT_ADMIN_LAST_NAME:-Admin}"

signup_body="$(mktemp)"
lock_body="$(mktemp)"
trap 'rm -f "${signup_body}" "${lock_body}"' EXIT

echo "Waiting for app readiness at ${BASE_URL}/api/v1/flags ..."
for i in $(seq 1 60); do
  if curl -fsS "${BASE_URL}/api/v1/flags" >/dev/null 2>&1; then
    echo "App is ready."
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo "ERROR: app did not become ready within ~5 minutes." >&2
    exit 1
  fi
  sleep 5
done

echo "Attempting to seed admin ${ADMIN_EMAIL} ..."
signup_code="$(curl -sS -o "${signup_body}" -w '%{http_code}' \
  -X POST "${BASE_URL}/api/v1/authentication/sign-up" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASSWORD}\",\"firstName\":\"${ADMIN_FIRST_NAME}\",\"lastName\":\"${ADMIN_LAST_NAME}\",\"trackEvents\":false,\"newsLetter\":false}")" \
  || { echo "ERROR: sign-up request failed at transport level (curl exit $?)." >&2; exit 1; }

if [ "${signup_code}" != "200" ]; then
  echo "Sign-up returned HTTP ${signup_code}; assuming admin already seeded. Skipping."
  cat "${signup_body}" || true
  echo
  exit 0
fi

token="$(grep -o '"token":"[^"]*"' "${signup_body}" | head -1 | sed 's/"token":"//; s/"$//' || true)"
platform_id="$(grep -o '"platformId":"[^"]*"' "${signup_body}" | head -1 | sed 's/"platformId":"//; s/"$//' || true)"

if [ -z "${token}" ] || [ -z "${platform_id}" ]; then
  echo "ERROR: could not parse token/platformId from sign-up response." >&2
  cat "${signup_body}" >&2 || true
  exit 1
fi

echo "Locking open registration (emailAuthEnabled=false) on platform ${platform_id} ..."
lock_code="$(curl -sS -o "${lock_body}" -w '%{http_code}' \
  -X POST "${BASE_URL}/api/v1/platforms/${platform_id}" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${token}" \
  -d '{"emailAuthEnabled":false}')" \
  || { echo "ERROR: lock-registration request failed at transport level (curl exit $?)." >&2; exit 1; }

if [ "${lock_code}" != "200" ]; then
  echo "ERROR: failed to lock registration (HTTP ${lock_code})." >&2
  cat "${lock_body}" >&2 || true
  exit 1
fi

echo "Admin seeded and open registration locked."
```

- [ ] **Step 2: Make it executable**

Run:
```bash
chmod +x scripts/uat/seed-admin.sh
```

- [ ] **Step 3: Syntax-check the script**

Run:
```bash
bash -n scripts/uat/seed-admin.sh && echo "syntax OK"
```
Expected: `syntax OK`. (If `shellcheck` is installed, also run `shellcheck scripts/uat/seed-admin.sh` and address warnings.)

- [ ] **Step 4: Commit**

```bash
git add scripts/uat/seed-admin.sh
git commit -m "feat(uat): idempotent seed-admin script (create owner + lock signup)"
```

---

## Task 5: Create `scripts/uat/deploy.sh`

**Files:**
- Create: `scripts/uat/deploy.sh`

Build locally, ship the image over SSH (`docker save | gzip | ssh | docker load`), sync compose + scripts, bring up the stack, seed. Reads target from env vars.

- [ ] **Step 1: Create `scripts/uat/deploy.sh` with this exact content**

```bash
#!/usr/bin/env bash
set -euo pipefail

# Build the UAT image locally, ship it to the UAT VM over SSH, bring up the stack, seed.
# Usage:
#   UAT_SSH=user@uat-host UAT_IMAGE_TAG=$(git rev-parse --short HEAD) scripts/uat/deploy.sh
# Prerequisite: ${UAT_REMOTE_DIR}/.env.uat already exists on the VM (filled secrets).

UAT_SSH="${UAT_SSH:?set UAT_SSH=user@host}"
UAT_IMAGE_TAG="${UAT_IMAGE_TAG:-latest}"
UAT_REMOTE_DIR="${UAT_REMOTE_DIR:-jrnyflw-uat}"
IMAGE="jrnyflw-uat:${UAT_IMAGE_TAG}"

echo "==> Building ${IMAGE} locally"
docker build -f Dockerfile.uat -t "${IMAGE}" .

echo "==> Shipping ${IMAGE} to ${UAT_SSH} (docker save | gzip | ssh | docker load)"
docker save "${IMAGE}" | gzip | ssh "${UAT_SSH}" 'gunzip | docker load'

echo "==> Syncing compose + scripts + nginx conf to ${UAT_SSH}:${UAT_REMOTE_DIR}"
ssh "${UAT_SSH}" "mkdir -p '${UAT_REMOTE_DIR}/scripts/uat' '${UAT_REMOTE_DIR}/nginx'"
scp docker-compose.uat.yml "${UAT_SSH}:${UAT_REMOTE_DIR}/"
scp scripts/uat/seed-admin.sh "${UAT_SSH}:${UAT_REMOTE_DIR}/scripts/uat/"
scp nginx/devflw.jrny.co.za.conf "${UAT_SSH}:${UAT_REMOTE_DIR}/nginx/"

echo "==> Bringing up stack (expects ${UAT_REMOTE_DIR}/.env.uat on the VM)"
ssh "${UAT_SSH}" "cd '${UAT_REMOTE_DIR}' && UAT_IMAGE_TAG='${UAT_IMAGE_TAG}' docker compose --env-file .env.uat -f docker-compose.uat.yml up -d"

echo "==> Seeding admin + locking signup"
ssh "${UAT_SSH}" "cd '${UAT_REMOTE_DIR}' && set -a && . ./.env.uat && set +a && bash scripts/uat/seed-admin.sh"

echo "==> Done. Verify at https://devflw.jrny.co.za"
```

- [ ] **Step 2: Make executable + syntax-check**

Run:
```bash
chmod +x scripts/uat/deploy.sh
bash -n scripts/uat/deploy.sh && echo "syntax OK"
```
Expected: `syntax OK`.

- [ ] **Step 3: Commit**

```bash
git add scripts/uat/deploy.sh
git commit -m "feat(uat): deploy script (build + save/load over SSH + up + seed)"
```

---

## Task 6: Create the nginx reference config + local smoke test

**Files:**
- Create: `nginx/devflw.jrny.co.za.conf`

- [ ] **Step 1: Create `nginx/devflw.jrny.co.za.conf` with this exact content**

```nginx
# JRNYFLW UAT reverse proxy for devflw.jrny.co.za.
# Place on the host nginx (e.g. /etc/nginx/sites-available/, symlink into sites-enabled),
# then `nginx -t && systemctl reload nginx`. TLS terminated here; upstream is plain HTTP.

map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 80;
    server_name devflw.jrny.co.za;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name devflw.jrny.co.za;

    # TLS certs managed by the host's existing tooling (e.g. certbot).
    ssl_certificate     /etc/letsencrypt/live/devflw.jrny.co.za/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/devflw.jrny.co.za/privkey.pem;

    client_max_body_size 100m;

    location / {
        proxy_pass http://127.0.0.1:3020;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;

        # WebSocket support (flow-run live updates)
        proxy_set_header Upgrade    $http_upgrade;
        proxy_set_header Connection $connection_upgrade;

        # Long-running flow executions
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
```

- [ ] **Step 2: Build the image locally (full build — slow, several minutes)**

Run:
```bash
docker build -f Dockerfile.uat -t jrnyflw-uat:smoke .
```
Expected: build completes successfully; the `turbo run build` step shows the custom + core piece build tasks (`@jrnyflw/jrny#build`, `@jrnyflw/nucleus#build`, `@jrnyflw/shoprite#build`, `@jrnyflw/mapper#build`, `@jrnyflw/excel#build`, `@activepieces/piece-data-mapper#build`, …) succeeding.

- [ ] **Step 3: Boot a throwaway local stack on loopback**

Run:
```bash
cp .env.uat.example .env.uat
# minimal local secrets so the app boots:
sed -i 's/^AP_ENCRYPTION_KEY=.*/AP_ENCRYPTION_KEY='"$(openssl rand -hex 16)"'/' .env.uat
sed -i 's/^AP_JWT_SECRET=.*/AP_JWT_SECRET='"$(openssl rand -hex 32)"'/' .env.uat
sed -i 's/^AP_POSTGRES_PASSWORD=.*/AP_POSTGRES_PASSWORD=localtest/' .env.uat
UAT_IMAGE_TAG=smoke docker compose --env-file .env.uat -f docker-compose.uat.yml up -d
```
Expected: three containers (`jrnyflw-uat-app/postgres/redis`) start; postgres and redis become healthy.

- [ ] **Step 4: Verify readiness and that custom pieces loaded**

Run:
```bash
# readiness
curl -fsS http://127.0.0.1:3020/api/v1/flags >/dev/null && echo "flags OK"
# seed an admin locally so we can list pieces with a token
set -a && . ./.env.uat && set +a
bash scripts/uat/seed-admin.sh
TOKEN="$(grep -o '"token":"[^"]*"' /tmp/uat-signup-body.json | head -1 | sed 's/"token":"//; s/"$//')"
curl -fsS http://127.0.0.1:3020/api/v1/pieces -H "Authorization: Bearer ${TOKEN}" \
  | grep -o '@jrnyflw/[a-z-]*' | sort -u
```
Expected: `flags OK`, seed script prints "Admin seeded and open registration locked.", and the final command lists `@jrnyflw/jrny`, `@jrnyflw/mapper`, `@jrnyflw/nucleus`, `@jrnyflw/shoprite` (and `@jrnyflw/excel`).

- [ ] **Step 5: Tear down the local stack**

Run:
```bash
docker compose --env-file .env.uat -f docker-compose.uat.yml down -v
rm -f .env.uat
```
Expected: containers + volumes removed. (`.env.uat` deleted so it is never committed.)

- [ ] **Step 6: Commit**

```bash
git add nginx/devflw.jrny.co.za.conf
git commit -m "feat(uat): nginx reverse-proxy reference config for devflw.jrny.co.za"
```

---

## Task 7: Deploy to the UAT VM (runbook — run WITH the user)

> Touches the real shared VM. Confirm the JRNY ERP must not be disturbed. Do not run autonomously.

- [ ] **Step 1: Pre-flight port + container inventory on the VM**

Run (on the VM):
```bash
docker ps --format '{{.Names}}\t{{.Ports}}'
ss -ltnp | grep -E ':3020|:80 |:443 ' || echo "3020/80/443 listeners shown above"
```
Expected: no listener on `127.0.0.1:3020`; ERP `jrny-uat-*` containers all present and untouched.

- [ ] **Step 2: Create `~/jrnyflw-uat/.env.uat` on the VM**

Copy `.env.uat.example` to the VM as `~/jrnyflw-uat/.env.uat`, then fill in:
`AP_ENCRYPTION_KEY` (`openssl rand -hex 16`), `AP_JWT_SECRET` (`openssl rand -hex 32`),
`AP_POSTGRES_PASSWORD`, `AP_UAT_ADMIN_EMAIL`, `AP_UAT_ADMIN_PASSWORD`.
Leave `APP_HOST_PORT=3020`. **Record the encryption key + JWT secret in the team secret store — they must never change.**

- [ ] **Step 3: Run the deploy script from the dev machine**

Run (on the dev machine, repo root):
```bash
UAT_SSH=<user>@<uat-host> UAT_IMAGE_TAG=$(git rev-parse --short HEAD) scripts/uat/deploy.sh
```
Expected: image builds, loads on the VM, stack comes up, seed script reports success.

- [ ] **Step 4: Wire up nginx on the VM**

Run (on the VM):
```bash
sudo cp ~/jrnyflw-uat/nginx/devflw.jrny.co.za.conf /etc/nginx/sites-available/devflw.jrny.co.za
sudo ln -sf /etc/nginx/sites-available/devflw.jrny.co.za /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```
(The conf was synced to `~/jrnyflw-uat/nginx/` by `deploy.sh` in Step 3.)
Expected: `nginx -t` reports syntax OK; reload succeeds. (Provision the TLS cert first if not already present.)

---

## Task 8: Post-deploy acceptance (runbook — run WITH the user)

- [ ] **Step 1: HTTPS + auth**

Browse `https://devflw.jrny.co.za`, log in as the seeded admin. Confirm self-signup is rejected (registration locked).

- [ ] **Step 2: Pieces + connections**

In the app, create a connection for `jrny`, `shoprite`, and `nucleus`. Confirm each connection saves and tests successfully.

- [ ] **Step 3: Smoke flow**

Build and run a minimal flow that calls each custom integration. Confirm the run succeeds and live updates stream (validates the nginx websocket config).

- [ ] **Step 4: ERP coexistence check**

Run (on the VM):
```bash
docker ps --format '{{.Names}}' | grep '^jrny-uat-' | sort
```
Expected: every ERP `jrny-uat-*` container still present and healthy; nothing stopped or recreated.

---

## Rollback & reset (reference)

- **Rollback to previous image:** on the VM, `cd ~/jrnyflw-uat && UAT_IMAGE_TAG=<previous-short-sha> docker compose --env-file .env.uat -f docker-compose.uat.yml up -d`.
- **Full UAT reset (wipes UAT data only):** `docker compose --env-file .env.uat -f docker-compose.uat.yml down -v` then re-deploy + re-seed. **Never** target ERP volumes/containers.
