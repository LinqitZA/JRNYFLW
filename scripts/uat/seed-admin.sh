#!/usr/bin/env bash
set -euo pipefail
umask 077

# Seeds the platform owner on a fresh install, then locks open registration.
#
# Sign-up alone does NOT create a platform: when no platform exists yet the server
# returns an ONBOARDING token with platformId=null, and the platform + project are
# created by a second call to POST /api/v1/platforms/. See
# authentication.service.ts (getOnboardingResponse) and platform.controller.ts.
#
# Idempotent, and recovers from a partially seeded install (user created but no
# platform) by signing in and resuming at the platform step.
#
# Run with .env.uat exported into the environment:
#   set -a && . ./.env.uat && set +a && bash scripts/uat/seed-admin.sh
#
# NOTE: AP_UAT_ADMIN_PASSWORD must not contain a double-quote (") or backslash (\),
#       because the JSON request bodies are assembled without a JSON encoder (no jq).

BASE_URL="${UAT_BASE_URL:-http://127.0.0.1:${APP_HOST_PORT:-3020}}"
ADMIN_EMAIL="${AP_UAT_ADMIN_EMAIL:?set AP_UAT_ADMIN_EMAIL}"
ADMIN_PASSWORD="${AP_UAT_ADMIN_PASSWORD:?set AP_UAT_ADMIN_PASSWORD}"
ADMIN_FIRST_NAME="${AP_UAT_ADMIN_FIRST_NAME:-JRNYFLW}"
ADMIN_LAST_NAME="${AP_UAT_ADMIN_LAST_NAME:-Admin}"
# Platform name must match SAFE_STRING_PATTERN ('^[^./]+$') — no dots or slashes.
PLATFORM_NAME="${AP_UAT_PLATFORM_NAME:-JRNYFLW}"

body="$(mktemp)"
trap 'rm -f "${body}"' EXIT

# Extract a quoted JSON string value. Prints nothing when the key is absent or null.
json_str() {
  grep -o "\"$2\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" "$1" \
    | head -1 \
    | sed 's/^[^:]*:[[:space:]]*"//; s/"$//' || true
}

api_post() {
  # api_post <path> <json-body> [bearer-token] -> prints HTTP code, response in $body
  local path="$1" data="$2" token="${3:-}"
  if [ -n "${token}" ]; then
    curl -sS -o "${body}" -w '%{http_code}' -X POST "${BASE_URL}${path}" \
      -H 'Content-Type: application/json' -H "Authorization: Bearer ${token}" -d "${data}"
  else
    curl -sS -o "${body}" -w '%{http_code}' -X POST "${BASE_URL}${path}" \
      -H 'Content-Type: application/json' -d "${data}"
  fi
}

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
code="$(api_post /api/v1/authentication/sign-up \
  "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASSWORD}\",\"firstName\":\"${ADMIN_FIRST_NAME}\",\"lastName\":\"${ADMIN_LAST_NAME}\",\"trackEvents\":false,\"newsLetter\":false}")" \
  || { echo "ERROR: sign-up request failed at transport level (curl exit $?)." >&2; exit 1; }

if [ "${code}" = "200" ]; then
  echo "Admin created."
else
  echo "Sign-up returned HTTP ${code}; admin likely already exists. Signing in instead."
  code="$(api_post /api/v1/authentication/sign-in \
    "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASSWORD}\"}")" \
    || { echo "ERROR: sign-in request failed at transport level (curl exit $?)." >&2; exit 1; }
  if [ "${code}" != "200" ]; then
    echo "ERROR: could not sign in as ${ADMIN_EMAIL} (HTTP ${code})." >&2
    cat "${body}" >&2 || true
    echo >&2
    exit 1
  fi
fi

token="$(json_str "${body}" token)"
platform_id="$(json_str "${body}" platformId)"

if [ -z "${token}" ]; then
  echo "ERROR: could not parse token from the authentication response." >&2
  cat "${body}" >&2 || true
  echo >&2
  exit 1
fi

if [ -z "${platform_id}" ]; then
  echo "No platform yet — creating platform '${PLATFORM_NAME}' and its project ..."
  code="$(api_post /api/v1/platforms/ "{\"name\":\"${PLATFORM_NAME}\"}" "${token}")" \
    || { echo "ERROR: create-platform request failed at transport level (curl exit $?)." >&2; exit 1; }
  if [ "${code}" != "200" ]; then
    echo "ERROR: failed to create platform (HTTP ${code})." >&2
    cat "${body}" >&2 || true
    echo >&2
    exit 1
  fi
  # Creating the platform invalidates the onboarding token; use the one returned here.
  token="$(json_str "${body}" token)"
  platform_id="$(json_str "${body}" platformId)"
  if [ -z "${token}" ] || [ -z "${platform_id}" ]; then
    echo "ERROR: could not parse token/platformId from the create-platform response." >&2
    cat "${body}" >&2 || true
    echo >&2
    exit 1
  fi
  echo "Platform ${platform_id} created."
else
  echo "Platform ${platform_id} already exists."
fi

echo "Locking open registration (emailAuthEnabled=false) on platform ${platform_id} ..."
code="$(api_post "/api/v1/platforms/${platform_id}" '{"emailAuthEnabled":false}' "${token}")" \
  || { echo "ERROR: lock-registration request failed at transport level (curl exit $?)." >&2; exit 1; }

if [ "${code}" != "200" ]; then
  echo "ERROR: failed to lock registration (HTTP ${code})." >&2
  cat "${body}" >&2 || true
  echo >&2
  exit 1
fi

echo "Admin seeded and open registration locked."
echo "NOTE: emailAuthEnabled is a no-op on Community edition — verify signup is"
echo "      actually closed by opening ${BASE_URL}/sign-up in a logged-out browser."
