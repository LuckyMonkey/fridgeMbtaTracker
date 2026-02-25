#!/usr/bin/env bash
set -euo pipefail

if [ "${EUID}" -ne 0 ]; then
  echo "Please re-run this script with sudo from your normal user account." >&2
  echo "Example: sudo ./scripts/fix_docker_permissions.sh" >&2
  exit 1
fi

TARGET_USER="${SUDO_USER:-}"
if [ -z "${TARGET_USER}" ]; then
  echo "This script must be invoked via sudo so that we can update your user records." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker CLI is not installed or not on PATH. Please install docker before running this script." >&2
  exit 1
fi

if ! getent group docker >/dev/null 2>&1; then
  groupadd docker
  echo "Created docker group."
fi

if id -nG "${TARGET_USER}" | grep -qw docker; then
  echo "${TARGET_USER} already belongs to the docker group."
else
  usermod -aG docker "${TARGET_USER}"
  echo "Added ${TARGET_USER} to docker group (new sessions required)."
fi

DOCKER_SOCK="/var/run/docker.sock"
if [ -S "${DOCKER_SOCK}" ]; then
  chown root:docker "${DOCKER_SOCK}"
  chmod 660 "${DOCKER_SOCK}"
  echo "Adjusted ${DOCKER_SOCK} ownership/permissions for docker group access."
else
  echo "${DOCKER_SOCK} is missing; is the Docker daemon running?" >&2
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

if docker compose version >/dev/null 2>&1; then
  docker compose restart
  echo "docker compose restart completed."
elif docker-compose version >/dev/null 2>&1; then
  docker-compose restart
  echo "docker-compose restart completed."
else
  echo "Neither docker compose nor docker-compose is available; please restart the containers manually once the group change takes effect." >&2
fi

echo "Done. Run 'newgrp docker' or log out/in for the group change to apply before running docker commands as ${TARGET_USER}."
