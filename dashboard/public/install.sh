#!/usr/bin/env bash
# SiriusOS one-line installer.
#
# Usage:
#   curl -sSL https://siriusos.unikprompt.com/install.sh | bash
#
# Or pin a specific version:
#   curl -sSL https://siriusos.unikprompt.com/install.sh | bash -s -- --version 0.1.5
#
# What it does:
#   1. Verifies Node.js 20+ is on PATH (instructs how to install if not).
#   2. Installs PM2 globally (skips if already present).
#   3. Installs the `siriusos` CLI globally from npm.
#   4. Starts the dashboard in production mode under PM2 on port 3013.
#   5. Prints the dashboard URL and credentials path.
#
# After this script, the user opens http://localhost:3013 and finishes
# setup through the visual wizard at /onboarding — no more terminal.

set -euo pipefail

VERSION="latest"
PORT="3013"
INSTANCE="default"
LANG_PREF=""

# ── Parse flags ──────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --version) VERSION="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --instance) INSTANCE="$2"; shift 2 ;;
    --lang) LANG_PREF="$2"; shift 2 ;;
    -h|--help)
      cat <<'EOF'
SiriusOS installer

Usage: install.sh [--version <npm-tag>] [--port <port>] [--instance <id>] [--lang en|es]

Defaults:
  --version  latest
  --port     3013
  --instance default
EOF
      exit 0
      ;;
    *) echo "Unknown flag: $1" >&2; exit 1 ;;
  esac
done

# ── Output helpers ───────────────────────────────────────────────────────────
BOLD="$(printf '\033[1m')"
DIM="$(printf '\033[2m')"
RED="$(printf '\033[31m')"
GREEN="$(printf '\033[32m')"
YELLOW="$(printf '\033[33m')"
RESET="$(printf '\033[0m')"

step() { printf "\n${BOLD}▸ %s${RESET}\n" "$1"; }
ok()   { printf "  ${GREEN}✓${RESET} %s\n" "$1"; }
warn() { printf "  ${YELLOW}⚠${RESET} %s\n" "$1"; }
fail() { printf "  ${RED}✗${RESET} %s\n" "$1"; exit 1; }

# ── Detect platform ──────────────────────────────────────────────────────────
case "$(uname -s)" in
  Darwin) PLATFORM="macOS" ;;
  Linux)  PLATFORM="Linux" ;;
  *)      fail "Unsupported platform: $(uname -s). Only macOS and Linux are supported today." ;;
esac

step "Installing SiriusOS on ${PLATFORM}"

# ── Check Node.js ────────────────────────────────────────────────────────────
if ! command -v node >/dev/null 2>&1; then
  warn "Node.js is not installed."
  echo "  Install it first:"
  echo "    macOS:  brew install node"
  echo "    Linux:  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs"
  echo "    or use nvm: https://github.com/nvm-sh/nvm"
  fail "Re-run this installer once Node 20+ is on PATH."
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [[ "$NODE_MAJOR" -lt 20 ]]; then
  fail "Node $NODE_MAJOR found, but SiriusOS needs Node 20+."
fi
ok "Node $(node -v) detected"

# ── PM2 ──────────────────────────────────────────────────────────────────────
if ! command -v pm2 >/dev/null 2>&1; then
  step "Installing PM2 globally"
  npm install -g pm2 >/dev/null 2>&1 || fail "Failed to install pm2. Try: sudo npm install -g pm2"
  ok "PM2 installed"
else
  ok "PM2 already installed ($(pm2 --version))"
fi

# ── siriusos CLI ─────────────────────────────────────────────────────────────
step "Installing siriusos@${VERSION} from npm"
if [[ "$VERSION" == "latest" ]]; then
  npm install -g siriusos >/dev/null 2>&1 || fail "npm install -g siriusos failed. If you saw EACCES, prepend sudo or fix npm prefix."
else
  npm install -g "siriusos@${VERSION}" >/dev/null 2>&1 || fail "npm install -g siriusos@${VERSION} failed."
fi
ok "siriusos $(siriusos --version 2>/dev/null || echo "$VERSION") installed"

# ── First-run install (state dirs, dashboard creds) ──────────────────────────
step "Bootstrapping state directory ~/.siriusos/${INSTANCE}/"
siriusos install --instance "$INSTANCE" >/dev/null
ok "State directory ready"

# ── Build & start dashboard under PM2 ────────────────────────────────────────
step "Building dashboard (this is the slow part — ~60s)"
LANG_FLAG=()
[[ -n "$LANG_PREF" ]] && LANG_FLAG=(--lang "$LANG_PREF")

# `siriusos dashboard --build` builds the Next.js app in the package's
# install directory and starts it in production mode. We run it in the
# background and rely on PM2 (later, via the visual wizard's setup) to
# manage agent processes — the dashboard itself runs as a separate
# `next start` invocation here.
nohup siriusos dashboard --build --port "$PORT" "${LANG_FLAG[@]}" >/tmp/siriusos-dashboard.log 2>&1 &
DASHBOARD_PID=$!
disown "$DASHBOARD_PID" 2>/dev/null || true

# Poll for readiness — up to 90 seconds.
READY=0
for _ in $(seq 1 90); do
  if curl -sSf "http://localhost:${PORT}/" >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 1
done

if [[ "$READY" -eq 1 ]]; then
  ok "Dashboard is up at http://localhost:${PORT}"
else
  warn "Dashboard did not respond on port ${PORT} within 90s."
  warn "Tail the log to debug: tail -f /tmp/siriusos-dashboard.log"
fi

# ── Final report ─────────────────────────────────────────────────────────────
CRED_PATH="$HOME/.siriusos/${INSTANCE}/dashboard.env"

cat <<EOF

${BOLD}Done.${RESET}

  Dashboard URL:        ${BOLD}http://localhost:${PORT}${RESET}
  Login credentials:    ${DIM}cat ${CRED_PATH}${RESET}
  Dashboard log:        ${DIM}tail -f /tmp/siriusos-dashboard.log${RESET}

Open the URL in your browser. The visual setup wizard will pick up from
there — pick a language, name your organization, paste a Telegram bot
token, and your fleet is live in under two minutes. No more terminal.

EOF

# Try to open the browser automatically. Failures are non-fatal.
if command -v open >/dev/null 2>&1; then
  open "http://localhost:${PORT}" >/dev/null 2>&1 || true
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "http://localhost:${PORT}" >/dev/null 2>&1 || true
fi
