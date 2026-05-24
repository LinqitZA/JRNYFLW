#!/usr/bin/env bash
set -euo pipefail

# Seeds the platform owner on a fresh UAT install, then locks open registration.
# Idempotent: if sign-up is rejected (owner already exists / auth disabled), exits 0.
# Depends only on curl, grep, sed. Run with .env.uat exported into the environment:
#   set -a && . ./.env.uat && set +a && bash scripts/uat/seed-admin.sh

BASE_URL="${UAT_BASE_URL:-http://127.0.0.1:${APP_HOST_PORT:-3020}}"
ADMIN_EMAIL="${AP_UAT_ADMIN_EMAIL:?set AP_UAT_ADMIN_EMAIL}"
ADMIN_PASSWORD="${AP_UAT_ADMIN_PASSWORD:?set AP_UAT_ADMIN_PASSWORD}"
ADMIN_FIRST_NAME="${AP_UAT_ADMIN_FIRST_NAME:-JRNYFLW}"
ADMIN_LAST_NAME="${AP_UAT_ADMIN_LAST_NAME:-Admin}"

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
signup_code="$(curl -sS -o /tmp/uat-signup-body.json -w '%{http_code}' \
  -X POST "${BASE_URL}/api/v1/authentication/sign-up" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASSWORD}\",\"firstName\":\"${ADMIN_FIRST_NAME}\",\"lastName\":\"${ADMIN_LAST_NAME}\",\"trackEvents\":false,\"newsLetter\":false}")"

if [ "${signup_code}" != "200" ]; then
  echo "Sign-up returned HTTP ${signup_code}; assuming admin already seeded. Skipping."
  cat /tmp/uat-signup-body.json || true
  echo
  exit 0
fi

token="$(grep -o '"token":"[^"]*"' /tmp/uat-signup-body.json | head -1 | sed 's/"token":"//; s/"$//')"
platform_id="$(grep -o '"platformId":"[^"]*"' /tmp/uat-signup-body.json | head -1 | sed 's/"platformId":"//; s/"$//')"

if [ -z "${token}" ] || [ -z "${platform_id}" ]; then
  echo "ERROR: could not parse token/platformId from sign-up response." >&2
  cat /tmp/uat-signup-body.json >&2 || true
  exit 1
fi

echo "Locking open registration (emailAuthEnabled=false) on platform ${platform_id} ..."
lock_code="$(curl -sS -o /tmp/uat-lock-body.json -w '%{http_code}' \
  -X POST "${BASE_URL}/api/v1/platforms/${platform_id}" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${token}" \
  -d '{"emailAuthEnabled":false}')"

if [ "${lock_code}" != "200" ]; then
  echo "ERROR: failed to lock registration (HTTP ${lock_code})." >&2
  cat /tmp/uat-lock-body.json >&2 || true
  exit 1
fi

echo "Admin seeded and open registration locked."
