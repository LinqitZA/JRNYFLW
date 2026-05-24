#!/usr/bin/env bash
set -euo pipefail

# Build the UAT image locally and ship it + the deploy files to the UAT VM over SSH.
# Does NOT start or seed the stack — run those on the VM yourself (commands are
# printed at the end). Re-run this script any time to ship a new image build.
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

cat <<EOF

==> Image + files delivered to ${UAT_SSH}:${UAT_REMOTE_DIR}
    Image tag: ${IMAGE}

Next, run these ON THE UAT VM to start (and, on first deploy, seed) the stack:

  cd ${UAT_REMOTE_DIR}
  UAT_IMAGE_TAG=${UAT_IMAGE_TAG} docker compose --env-file .env.uat -f docker-compose.uat.yml up -d

  # First deploy only — create the admin and lock open signup:
  set -a && . ./.env.uat && set +a && bash scripts/uat/seed-admin.sh

Then verify at https://devflw.jrny.co.za
EOF
