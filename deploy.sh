#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env"

if [ ! -f "${ENV_FILE}" ]; then
  echo "Error: ${ENV_FILE} not found" >&2
  exit 1
fi

source "${ENV_FILE}"

: "${IMAGE_NAME:?IMAGE_NAME not set in .env}"
: "${REMOTE_HOST:?REMOTE_HOST not set in .env}"
: "${REMOTE_DIR:?REMOTE_DIR not set in .env}"
: "${ARCHIVE_NAME:?ARCHIVE_NAME not set in .env}"

echo "Building Docker image for arm64 (Raspberry Pi 5)..."
docker build --no-cache --platform linux/arm64 -t "${IMAGE_NAME}:arm64" .

echo "Saving image to archive..."
docker save "${IMAGE_NAME}:arm64" | gzip > "/tmp/${ARCHIVE_NAME}"

echo "Copying archive to ${REMOTE_HOST}:${REMOTE_DIR}/..."
scp "/tmp/${ARCHIVE_NAME}" "${REMOTE_HOST}:${REMOTE_DIR}/${ARCHIVE_NAME}"

echo "Cleaning up local archive..."
rm "/tmp/${ARCHIVE_NAME}"

echo "Running update script on remote..."
ssh "${REMOTE_HOST}" "cd ${REMOTE_DIR} && bash update.sh"

echo "Deploy complete."
