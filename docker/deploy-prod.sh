#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${SCRIPT_DIR}"

if [ "$#" -gt 0 ]; then
  docker compose \
    --env-file "${REPO_ROOT}/.env" \
    -f docker-compose.prod.yml \
    "$@"
else
  docker compose \
    --env-file "${REPO_ROOT}/.env" \
    -f docker-compose.prod.yml \
    up -d --remove-orphans
fi
