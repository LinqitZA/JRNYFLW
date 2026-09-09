# JRNYFLW — Customer Site Deployment Runbook

Deploys JRNYFLW to a customer's server as an all-in-one Docker stack (app + Postgres +
Redis) behind the host's nginx with HTTPS.

This is the same stack that runs `devflw.jrny.co.za`, pointed at a new host and domain.
The image is **built on the customer's server** from a clone of the repo, so
`scripts/uat/deploy.sh` (the build-here-and-ship-an-image path) is **not** used.

## What's involved

| File | Role |
|---|---|
| `Dockerfile.uat` | All-in-one image. Keeps the custom pieces (jrny, nucleus, shoprite, mapper, excel, data-mapper). **Not** the base `Dockerfile`, which deletes them. |
| `docker-compose.uat.yml` | app + postgres + redis. Compose project `jrnyflw-uat`. App binds `127.0.0.1` only; Postgres/Redis get no host ports. |
| `.env.uat.example` | Template for `.env.uat` — secrets, DB creds, `AP_DEV_PIECES`, admin seed vars. |
| `scripts/uat/seed-admin.sh` | Creates the platform owner on first boot. Idempotent. |
| `nginx/devflw.jrny.co.za.conf` | Host nginx: TLS termination, WebSocket upgrade, 3600s proxy timeouts. Adapted per-domain in step 7. |

## Before you start

Set these once in your shell on the customer's server; every command below uses them.

```bash
export DOMAIN=flw.customer.co.za        # their hostname
export PORT=3020                        # change in step 1 if taken
```

---

## Step 0 — Prereqs

```bash
docker --version && docker compose version     # need compose v2 (`docker compose`, not `docker-compose`)
nproc; free -g; df -h /var/lib/docker
```

Requirements:

- **~8 GB RAM** for the build. Below that, the `web` build is the step that OOMs.
- **~20 GB free disk** (final image ~3.3 GB, plus build cache).
- **Outbound internet** during the build (npm registry, GitHub for the Bun release).
- Compose v2. Docker 23+ so BuildKit is on by default.

## Step 1 — Confirm the port is free

```bash
ss -ltnp | grep -E ':(80|443|3020)\b'
```

Only the app takes a host port — Postgres and Redis are on the internal Docker network
with no host ports, so they can't collide with anything the customer already runs. If
`3020` is taken, pick another and `export PORT=<n>`; it appears only in `.env.uat` and
the nginx conf.

## Step 2 — Repo on the right commit

```bash
cd ~/repo/jrnyflw          # wherever it was cloned
git fetch origin && git checkout main && git pull --ff-only
git log --oneline -1
```

## Step 3 — Create `.env.uat`

`.env.uat` is gitignored, so it is **not** in the clone — you create it on the server.
Generate fresh secrets for this customer; never reuse another environment's.

```bash
cp .env.uat.example .env.uat && chmod 600 .env.uat

ENC=$(openssl rand -hex 16)
JWT=$(openssl rand -hex 32)
DBPW=$(openssl rand -base64 24 | tr -d '/+=')
ADMINPW=$(openssl rand -base64 18 | tr -d '/+=')

sed -i \
  -e "s|^AP_FRONTEND_URL=.*|AP_FRONTEND_URL=https://${DOMAIN}|" \
  -e "s|^AP_WEBHOOK_URL=.*|AP_WEBHOOK_URL=https://${DOMAIN}|" \
  -e "s|^APP_HOST_PORT=.*|APP_HOST_PORT=${PORT}|" \
  -e "s|^AP_ENCRYPTION_KEY=.*|AP_ENCRYPTION_KEY=${ENC}|" \
  -e "s|^AP_JWT_SECRET=.*|AP_JWT_SECRET=${JWT}|" \
  -e "s|^AP_POSTGRES_PASSWORD=.*|AP_POSTGRES_PASSWORD=${DBPW}|" \
  -e "s|^AP_UAT_ADMIN_PASSWORD=.*|AP_UAT_ADMIN_PASSWORD=${ADMINPW}|" \
  .env.uat

echo "ADMIN PASSWORD (save to your password manager now): ${ADMINPW}"
grep -c REPLACE_WITH .env.uat    # must print 0
```

Then set the admin email by hand:

```bash
sed -i "s|^AP_UAT_ADMIN_EMAIL=.*|AP_UAT_ADMIN_EMAIL=admin@customer.co.za|" .env.uat
grep AP_UAT_ADMIN .env.uat
```

> The admin password must not contain `"` or `\` — `seed-admin.sh` assembles its JSON
> body without a JSON encoder. The generator above already strips problem characters.

### Do not rotate the secrets

`AP_ENCRYPTION_KEY` and `AP_JWT_SECRET` are generated **once, for the life of the
install**. Rotating the encryption key makes every stored connection (JRNY, Nucleus,
Shoprite credentials) permanently undecryptable. Back `.env.uat` up somewhere safe on
day one — a database backup is worthless without it.

## Step 4 — Build the image

```bash
DOCKER_BUILDKIT=1 docker build -f Dockerfile.uat -t jrnyflw-uat:latest .
```

15–30 minutes cold.

## Step 5 — Start the stack

```bash
docker compose --env-file .env.uat -f docker-compose.uat.yml up -d
docker compose --env-file .env.uat -f docker-compose.uat.yml logs -f app
```

Database migrations run automatically on first boot. Once the log settles:

```bash
curl -fsS http://127.0.0.1:${PORT}/api/v1/flags >/dev/null && echo READY
```

## Step 6 — Seed the admin user

```bash
set -a && . ./.env.uat && set +a && bash scripts/uat/seed-admin.sh
```

Idempotent — safe to re-run; exits 0 if the owner already exists.

> **Caveat:** the script also POSTs `emailAuthEnabled=false` to "lock" open signup, but
> that flag is a **no-op on Community edition** (`assertEmailAuthIsEnabled` returns early
> for CE). Self-registration is instead gated by the invitation check
> (`assertUserIsInvitedToPlatformOrProject`). **Verify this yourself** — see step 8.3.

## Step 7 — DNS, TLS, nginx

The `A` record for `$DOMAIN` must resolve to the server's public IP **before** certbot runs.

```bash
# 1. temporary port-80 block so certbot can validate
sudo tee /etc/nginx/sites-available/${DOMAIN}.conf >/dev/null <<EOF
server { listen 80; server_name ${DOMAIN}; root /var/www/html; }
EOF
sudo ln -sf /etc/nginx/sites-available/${DOMAIN}.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 2. issue the certificate
sudo certbot certonly --webroot -w /var/www/html -d ${DOMAIN}

# 3. install the real conf, adapted from the devflw one
sed -e "s/devflw\.jrny\.co\.za/${DOMAIN}/g" \
    -e "s/127\.0\.0\.1:3020/127.0.0.1:${PORT}/" \
    nginx/devflw.jrny.co.za.conf | sudo tee /etc/nginx/sites-available/${DOMAIN}.conf >/dev/null
sudo nginx -t && sudo systemctl reload nginx
```

That conf carries the two things Activepieces breaks without: WebSocket upgrade headers
(live flow-run updates in the builder) and 3600s proxy timeouts (long flow executions).

Firewall: only 80 and 443 need to be open. The app binds `127.0.0.1` only.

## Step 8 — Acceptance checks

1. `https://$DOMAIN` loads; sign in with the admin email and the password from step 3.
2. Create a flow, add a step, and confirm **jrny, nucleus, shoprite, mapper, excel,
   data-mapper** all appear in the piece list.
3. In a logged-out private window, open `https://$DOMAIN/sign-up` and confirm a stranger
   cannot self-register (see the step 6 caveat).
4. Hand over to the customer to create their JRNY / Nucleus / Shoprite connections in the
   UI. No credentials are baked into the deployment.

---

## Operating it

### Redeploy after a code change

```bash
cd ~/repo/jrnyflw
git pull --ff-only
DOCKER_BUILDKIT=1 docker build -f Dockerfile.uat -t jrnyflw-uat:latest .
docker compose --env-file .env.uat -f docker-compose.uat.yml up -d
```

### Never run this

```bash
docker compose --env-file .env.uat -f docker-compose.uat.yml down -v    # ☠️
```

`-v` deletes the `jrnyflw_uat_pg_data` volume and every flow, run, and connection with
it. Plain `down` (no `-v`) is safe.

### Logs and status

```bash
docker compose --env-file .env.uat -f docker-compose.uat.yml ps
docker compose --env-file .env.uat -f docker-compose.uat.yml logs -f app
docker compose --env-file .env.uat -f docker-compose.uat.yml restart app
```

### Backups (not configured by this runbook — set it up)

A nightly `pg_dump` plus an off-box copy of `.env.uat`:

```bash
docker exec jrnyflw-uat-postgres pg_dump -U "$AP_POSTGRES_USERNAME" "$AP_POSTGRES_DATABASE" \
  | gzip > jrnyflw-$(date +%F).sql.gz
```

The dump is only restorable alongside the matching `AP_ENCRYPTION_KEY`.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| A custom piece is missing from the piece list | `AP_DEV_PIECES` in `.env.uat` uses **dist folder names**, not package names. Confirm the folder exists in the image: `docker exec jrnyflw-uat-app ls packages/pieces/custom` |
| Build killed around the `web` step | Out of RAM. Needs ~8 GB. |
| App container restarts in a loop | `docker compose ... logs app` — usually a bad `AP_POSTGRES_PASSWORD` or a missing `AP_ENCRYPTION_KEY` in `.env.uat`. |
| Builder loses live run updates / spinner hangs | nginx is missing the WebSocket upgrade headers — re-check step 7.3. |
| `apt-get update` fails, exit 100, "Release file ... is expired" | The base image's Debian release reached end-of-life. Fixed by moving to `node:24.14.0-bookworm-slim` (Debian 12). Do **not** work around it with `Acquire::Check-Valid-Until "false"` — that pins the install to a distro receiving no security patches. |
| `bun install` fails on `redis-memory-server` postinstall (`cmake: not found`, `pkg-config: not found`) | Its postinstall compiles the latest stable Redis from source to warm a test-only cache. Suppressed by `REDISMS_DISABLE_POSTINSTALL=1`, set in the `base` stage of both Dockerfiles. Safe because the in-memory Redis is only used for `AP_QUEUE_MODE=MEMORY`, and the stack uses a real Redis container. |
| `certbot` fails validation | DNS `A` record not resolving to this server yet, or port 80 blocked upstream. |
| Compose recreated some other stack's containers | A second compose file in this directory without a top-level `name:`. `docker-compose.uat.yml` sets `name: jrnyflw-uat` for exactly this reason — never remove it. |

## Known rough edges

- **Naming still says "uat" throughout** — file names, container names, compose project
  `jrnyflw-uat`, database `jrnyflw_uat`. Cosmetic and functional, but worth
  parameterizing if this becomes the customer's long-lived environment.
- **Signup lock is a no-op in CE** — see step 6.
- **No backup job ships with this** — see above.
