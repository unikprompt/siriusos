#!/bin/bash
# run-cron.sh — wrapper invocado por launchd (macOS) o cron (Linux) cada 10 min.
# Resuelve PATH (launchd no hereda el del shell), carga el .env del agente
# que tiene la sessionKey, y dispara usage-fetch.ts --once.
set -e

# PATH típico: nvm (cualquier versión instalada), homebrew (Intel + Apple
# Silicon), sistema. Adaptar si tu node vive en otro lado.
NVM_BIN="$(ls -d "$HOME/.nvm/versions/node/"v*/bin 2>/dev/null | sort -V | tail -1)"
export PATH="${NVM_BIN}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

# Carga sessionKey + org_id del .env del agente que es dueño de la cookie.
# Default: agent llamado "sentinel" en la org default. Override con
# AGENT_ENV_FILE si el agente dueño es otro.
ENV_FILE="${AGENT_ENV_FILE:-$HOME/siriusos/orgs/your-org/agents/sentinel/.env}"
if [ ! -f "$ENV_FILE" ]; then
  echo "$(date -u +%FT%TZ) ERROR: $ENV_FILE no existe (set AGENT_ENV_FILE)" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

# Override path de output: mantenemos el destino donde el agente consumidor
# lee. Override con USAGE_OUTPUT si el consumidor es otro.
OUTPUT="${USAGE_OUTPUT:-$HOME/.siriusos/default/state/sentinel/anthropic_usage.json}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

exec npx tsx "${SCRIPT_DIR}/usage-fetch.ts" --once --output "$OUTPUT"
