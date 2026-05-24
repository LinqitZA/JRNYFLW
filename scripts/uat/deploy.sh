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
