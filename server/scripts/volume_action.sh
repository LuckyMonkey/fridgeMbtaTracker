#!/bin/sh
set -eu

ACTION="${1:-${MBTA_AUTOMATION_ACTION:-}}"
if [ -z "${ACTION}" ]; then
  echo "Usage: volume_action.sh <raise|restore>" >&2
  exit 2
fi

STATE_FILE="${VOLUME_STATE_FILE:-/app/state/volume_state.env}"
STATE_DIR="$(dirname "${STATE_FILE}")"
mkdir -p "${STATE_DIR}"

BACKEND="${VOLUME_BACKEND:-auto}"
BOOST_DELTA="${VOLUME_BOOST_DELTA:-20}"
BOOST_TARGET="${VOLUME_BOOST_TARGET:-85}"
MAX_VOLUME="${VOLUME_MAX_PERCENT:-120}"
DRY_RUN="${VOLUME_DRY_RUN:-false}"
RAISE_HOOK="${VOLUME_RAISE_HOOK:-}"
RESTORE_HOOK="${VOLUME_RESTORE_HOOK:-}"

log() {
  printf '%s\n' "volume_action: $*"
}

bool_true() {
  case "$(printf '%s' "${1}" | tr '[:upper:]' '[:lower:]')" in
    1|true|yes|on) return 0 ;;
    *) return 1 ;;
  esac
}

pick_backend() {
  if [ "${BACKEND}" != "auto" ]; then
    echo "${BACKEND}"
    return
  fi

  if command -v pactl >/dev/null 2>&1 && pactl info >/dev/null 2>&1; then
    echo "pactl"
    return
  fi

  if command -v amixer >/dev/null 2>&1 && amixer sget Master >/dev/null 2>&1; then
    echo "amixer"
    return
  fi

  echo "none"
}

extract_first_percent() {
  sed -n 's/.*\[\([0-9][0-9]*\)%\].*/\1/p' | head -n 1
}

get_current_volume() {
  selected="$1"
  if [ "${selected}" = "pactl" ]; then
    pactl get-sink-volume @DEFAULT_SINK@ | extract_first_percent
    return
  fi
  if [ "${selected}" = "amixer" ]; then
    amixer sget Master | extract_first_percent
    return
  fi
  echo ""
}

set_volume() {
  selected="$1"
  percent="$2"

  if bool_true "${DRY_RUN}"; then
    log "dry-run set ${selected} volume to ${percent}%"
    return 0
  fi

  if [ "${selected}" = "pactl" ]; then
    pactl set-sink-volume @DEFAULT_SINK@ "${percent}%"
    return 0
  fi
  if [ "${selected}" = "amixer" ]; then
    amixer sset Master "${percent}%"
    return 0
  fi
  log "no working volume backend; skipped set_volume"
  return 1
}

run_hook() {
  hook="$1"
  if [ -z "${hook}" ]; then
    return 0
  fi
  if bool_true "${DRY_RUN}"; then
    log "dry-run hook: ${hook}"
    return 0
  fi
  sh -lc "${hook}"
}

save_state() {
  current="$1"
  selected="$2"
  cat > "${STATE_FILE}" <<EOF
CURRENT_VOLUME=${current}
BACKEND=${selected}
EOF
}

load_state() {
  if [ ! -f "${STATE_FILE}" ]; then
    return 1
  fi
  # shellcheck disable=SC1090
  . "${STATE_FILE}"
  return 0
}

to_int() {
  printf '%s\n' "$1" | awk '{print int($1)}'
}

cap_value() {
  value="$1"
  max="$2"
  awk -v v="$value" -v m="$max" 'BEGIN { if (v < 0) v = 0; if (v > m) v = m; print int(v); }'
}

raise_volume() {
  selected="$(pick_backend)"
  if [ "${selected}" = "none" ]; then
    log "no usable audio backend (pactl/amixer)"
    run_hook "${RAISE_HOOK}" || true
    return 0
  fi

  current="$(get_current_volume "${selected}")"
  if [ -z "${current}" ]; then
    log "could not read current volume from ${selected}"
    run_hook "${RAISE_HOOK}" || true
    return 0
  fi

  current_i="$(to_int "${current}")"
  delta_i="$(to_int "${BOOST_DELTA}")"
  target_i="$(to_int "${BOOST_TARGET}")"
  max_i="$(to_int "${MAX_VOLUME}")"

  boosted=$((current_i + delta_i))
  if [ "${boosted}" -lt "${target_i}" ]; then
    boosted="${target_i}"
  fi
  boosted="$(cap_value "${boosted}" "${max_i}")"

  save_state "${current_i}" "${selected}"
  log "raise ${selected}: ${current_i}% -> ${boosted}%"
  set_volume "${selected}" "${boosted}" || true
  run_hook "${RAISE_HOOK}" || true
}

restore_volume() {
  if load_state; then
    prev="${CURRENT_VOLUME:-}"
    selected="${BACKEND:-$(pick_backend)}"
    if [ -n "${prev}" ] && [ "${selected}" != "none" ]; then
      prev_i="$(to_int "${prev}")"
      log "restore ${selected}: -> ${prev_i}%"
      set_volume "${selected}" "${prev_i}" || true
    else
      log "state file missing usable values; skipping backend restore"
    fi
    rm -f "${STATE_FILE}" || true
  else
    log "no saved state file; nothing to restore"
  fi
  run_hook "${RESTORE_HOOK}" || true
}

case "${ACTION}" in
  raise) raise_volume ;;
  restore) restore_volume ;;
  *)
    echo "Invalid action: ${ACTION} (expected raise|restore)" >&2
    exit 2
    ;;
esac
