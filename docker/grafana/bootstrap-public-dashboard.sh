#!/bin/sh
set -eu

GRAFANA_URL="${GRAFANA_URL:-http://grafana:3000}"
GRAFANA_ADMIN_USER="${GRAFANA_ADMIN_USER:?GRAFANA_ADMIN_USER is required}"
GRAFANA_ADMIN_PASSWORD="${GRAFANA_ADMIN_PASSWORD:?GRAFANA_ADMIN_PASSWORD is required}"
GRAFANA_PUBLIC_DASHBOARD_UID="${GRAFANA_PUBLIC_DASHBOARD_UID:?GRAFANA_PUBLIC_DASHBOARD_UID is required}"
GRAFANA_SHARED_DASHBOARD_UID="${GRAFANA_SHARED_DASHBOARD_UID:?GRAFANA_SHARED_DASHBOARD_UID is required}"
GRAFANA_SHARED_DASHBOARD_ACCESS_TOKEN="${GRAFANA_SHARED_DASHBOARD_ACCESS_TOKEN:?GRAFANA_SHARED_DASHBOARD_ACCESS_TOKEN is required}"

auth_args="-u ${GRAFANA_ADMIN_USER}:${GRAFANA_ADMIN_PASSWORD}"

until curl -fsS ${auth_args} "${GRAFANA_URL}/api/health" >/dev/null; do
  sleep 2
done

response_file="$(mktemp)"
status_code="$(
  curl -sS \
    ${auth_args} \
    -o "${response_file}" \
    -w '%{http_code}' \
    "${GRAFANA_URL}/api/dashboards/uid/${GRAFANA_PUBLIC_DASHBOARD_UID}/public-dashboards/"
)"

payload="$(cat <<EOF
{"uid":"${GRAFANA_SHARED_DASHBOARD_UID}","accessToken":"${GRAFANA_SHARED_DASHBOARD_ACCESS_TOKEN}","timeSelectionEnabled":true,"annotationsEnabled":false,"isEnabled":true,"share":"public"}
EOF
)"

if [ "${status_code}" = "200" ]; then
  existing_uid="$(
    tr -d '\n' < "${response_file}" |
      sed -n 's/.*"uid":"\([^"]*\)".*/\1/p' |
      head -n 1
  )"

  update_payload='{"timeSelectionEnabled":true,"annotationsEnabled":false,"isEnabled":true,"share":"public"}'

  if [ -z "${existing_uid}" ]; then
    existing_uid="${GRAFANA_SHARED_DASHBOARD_UID}"
  fi

  curl -fsS \
    ${auth_args} \
    -X PATCH \
    -H 'Content-Type: application/json' \
    -d "${update_payload}" \
    "${GRAFANA_URL}/api/dashboards/uid/${GRAFANA_PUBLIC_DASHBOARD_UID}/public-dashboards/${existing_uid}" \
    >/dev/null
else
  curl -fsS \
    ${auth_args} \
    -X POST \
    -H 'Content-Type: application/json' \
    -d "${payload}" \
    "${GRAFANA_URL}/api/dashboards/uid/${GRAFANA_PUBLIC_DASHBOARD_UID}/public-dashboards/" \
    >/dev/null
fi

rm -f "${response_file}"
