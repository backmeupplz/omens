#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ROOT_ENV_FILE="${REPO_ROOT}/.env"
DOCKER_ENV_FILE="${SCRIPT_DIR}/.env"

cd "${SCRIPT_DIR}"

ENV_FILE="${ROOT_ENV_FILE}"
if [ ! -f "${ENV_FILE}" ]; then
  ENV_FILE="${DOCKER_ENV_FILE}"
fi

if [ ! -f "${ENV_FILE}" ]; then
  echo "No env file found. Create ${ROOT_ENV_FILE} (preferred) or ${DOCKER_ENV_FILE}."
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "${ENV_FILE}"
set +a

COMPOSE_ARGS=(
  --env-file "${ENV_FILE}"
  -f docker-compose.prod.yml
)

if [ -n "${DOMAIN:-}" ]; then
  COMPOSE_ARGS+=(--profile caddy)
else
  echo "DOMAIN is unset; skipping Caddy. Omens will stay on port ${PORT:-3000} only."
fi

if [ -n "${GRAFANA_DOMAIN:-}" ] && [ -n "${GRAFANA_ADMIN_PASSWORD:-}" ] && [ -n "${GRAFANA_DB_PASSWORD:-}" ]; then
  COMPOSE_ARGS+=(--profile grafana)
else
  echo "Grafana env is incomplete; skipping Grafana stack."
fi

if [ "$#" -gt 0 ]; then
  docker compose \
    "${COMPOSE_ARGS[@]}" \
    "$@"
else
  docker compose "${COMPOSE_ARGS[@]}" pull omens || true
  docker compose \
    "${COMPOSE_ARGS[@]}" \
    up -d --remove-orphans
fi
