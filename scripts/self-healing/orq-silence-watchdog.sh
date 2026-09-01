#!/bin/bash
# Silence watchdog for the SiriusOS orchestrator (or any single agent).
#
# WHY: alerts Mario DIRECTLY when the target agent stops updating its heartbeat
# for too long. The in-fleet escalation path is not enough on its own: during
# the 2026-08-29 -> 08-31 incident the orchestrator was down ~2 days, and the
# other agents dutifully escalated every ~4h... TO the orchestrator, which was
# the thing that was down. An escalation channel that passes through the
# component that can fail is not a channel. This runs via launchd (OS level),
# independent of the siriusos daemon AND of the agent process, so it survives
# both being dead.
#
# SIGNAL: heartbeat staleness. The heartbeat is written on EVERY heartbeat cycle
# (src/bus/heartbeat.ts -> state/<agent>/heartbeat.json:last_heartbeat),
# unconditionally. Outbound messages are NOT a good signal: there are
# legitimately-silent cycles (e.g. check-approvals with 0 approvals sends
# nothing, correctly). So "last heartbeat age" is the true liveness signal.
#
# Runs every ~30 min via launchd. See README.md for install.
#
# DRY RUN: set ORQ_WATCHDOG_DRY_RUN=1 to PRINT the alert instead of sending it.
# Every knob below is overridable via env, which is also how the test drives it.

set -u

INSTANCE="${CTX_INSTANCE_ID:-default}"
TARGET="${ORQ_WATCHDOG_TARGET:-orquestador}"
ROOT="$HOME/.siriusos/$INSTANCE"
FRAMEWORK_ROOT="${FRAMEWORK_ROOT:-$HOME/siriusos}"

# THRESHOLD. The target's heartbeat cron fires every 4h. A single missed cycle
# can leave the heartbeat up to ~8h old and still be a healthy agent that will
# self-recover on the next tick. 9h = one full missed cycle (8h) + ~1h of cron
# injection / processing jitter, so a single miss NEVER false-positives, while a
# real outage is caught within 9h — vs the ~2-day outage that motivated this.
# Override with ORQ_WATCHDOG_STALE_HOURS.
STALE_HOURS="${ORQ_WATCHDOG_STALE_HOURS:-9}"
STALE_SECONDS=$(( STALE_HOURS * 3600 ))

# RE-ALERT cooldown. Once alerted, don't re-send on every launchd tick. Remind
# Mario every REALERT_HOURS while still stale (mirrors the fleet's ~4h cadence,
# but pointed at Mario instead of the dead component).
REALERT_HOURS="${ORQ_WATCHDOG_REALERT_HOURS:-4}"
REALERT_SECONDS=$(( REALERT_HOURS * 3600 ))

# CEILING for intentional silence. If .user-stop is present we normally stay
# quiet — but .user-stop can be ORPHANED (it persists across some restarts, a
# documented behavior of this system), and an orphaned marker during a real
# outage would silence the watchdog in exactly the case it exists for. So past
# this much staleness we do NOT stay quiet: we ASK (a question, not a false
# alarm) whether the stop is still intentional or the marker was left orphaned.
# A full day stopped on purpose deserves a confirmation anyway.
USERSTOP_CEIL_HOURS="${ORQ_WATCHDOG_USERSTOP_CEILING_HOURS:-24}"
USERSTOP_CEIL_SECONDS=$(( USERSTOP_CEIL_HOURS * 3600 ))

# Paths (all overridable for tests).
HB_FILE="${ORQ_WATCHDOG_HEARTBEAT_FILE:-$ROOT/state/$TARGET/heartbeat.json}"
USER_STOP_FILE="${ORQ_WATCHDOG_USER_STOP_FILE:-$ROOT/state/$TARGET/.user-stop}"
STATE_FILE="${ORQ_WATCHDOG_STATE_FILE:-$ROOT/silence-watchdog-$TARGET.state}"
LOG_FILE="${ORQ_WATCHDOG_LOG_FILE:-$ROOT/logs/silence-watchdog.log}"
ALERT_ENV="${ORQ_WATCHDOG_ALERT_ENV:-$FRAMEWORK_ROOT/orgs/unikprompt/agents/$TARGET/.env}"
DRY_RUN="${ORQ_WATCHDOG_DRY_RUN:-0}"

# "now" is overridable so tests are deterministic (no dependence on wall clock).
NOW="${ORQ_WATCHDOG_NOW_EPOCH:-$(date -u +%s)}"

mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || true
# log() writes to the log file AND stdout, so launchd captures it and the test
# can assert on it.
log() {
  local line="[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $*"
  echo "$line" >> "$LOG_FILE" 2>/dev/null || true
  echo "$*"
}

# --- Guard: no heartbeat file. Ambiguous (never started / fresh) -> quiet. ---
if [ ! -f "$HB_FILE" ]; then
  log "SKIP: heartbeat file missing ($HB_FILE) — cannot assess, not alarming."
  exit 0
fi

# --- Extract last_heartbeat (ISO 8601 UTC). No jq/python needed to READ it. ---
LAST_HB=$(sed -n 's/.*"last_heartbeat"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$HB_FILE" | head -1)
if [ -z "$LAST_HB" ]; then
  log "SKIP: could not parse last_heartbeat from $HB_FILE — not alarming."
  exit 0
fi

# ISO UTC -> epoch (macOS date -j -u -f). BSD date only; documented in README.
HB_EPOCH=$(date -j -u -f "%Y-%m-%dT%H:%M:%SZ" "$LAST_HB" +%s 2>/dev/null || true)
if [ -z "$HB_EPOCH" ]; then
  log "SKIP: could not convert last_heartbeat '$LAST_HB' to epoch — not alarming."
  exit 0
fi

STALE=$(( NOW - HB_EPOCH ))
STALE_H=$(( STALE / 3600 ))

# --- Decide: alarm or not, and with which message. ---
MSG=""
if [ -f "$USER_STOP_FILE" ]; then
  # Intentional stop -> stay quiet, UNLESS it has been stopped far longer than a
  # normal check-in would take. Past the ceiling, ask whether the marker is
  # orphaned (it can persist across restarts) rather than silently trusting it.
  if [ "$STALE" -gt "$USERSTOP_CEIL_SECONDS" ]; then
    MSG="⚠️ Watchdog: el agente $TARGET lleva ${STALE_H}h parado con .user-stop presente (techo ${USERSTOP_CEIL_HOURS}h). ¿Es intencional, o quedó un marcador huérfano? Si es real: borrá el .user-stop y levantalo con siriusos start $TARGET. Si es a propósito, ignorá este aviso."
  else
    log "SKIP: $TARGET has .user-stop and is ${STALE_H}h stale (<= ${USERSTOP_CEIL_HOURS}h ceiling) — intentional silence, not alarming."
    rm -f "$STATE_FILE" 2>/dev/null || true
    exit 0
  fi
elif [ "$STALE" -gt "$STALE_SECONDS" ]; then
  MSG="⚠️ Watchdog: el agente $TARGET lleva ${STALE_H}h sin actualizar su heartbeat (umbral ${STALE_HOURS}h). Última señal: $LAST_HB. Puede estar caído o mudo. Revisá y levantalo: siriusos start $TARGET"
else
  log "OK: $TARGET heartbeat ${STALE_H}h old (<= ${STALE_HOURS}h). last=$LAST_HB"
  rm -f "$STATE_FILE" 2>/dev/null || true   # healthy/recovered -> clear alert state
  exit 0
fi

# --- ALARM (either a real silence, or a .user-stop past the ceiling). Throttle. ---
LAST_ALERT=$(cat "$STATE_FILE" 2>/dev/null || echo 0)
case "$LAST_ALERT" in ''|*[!0-9]*) LAST_ALERT=0 ;; esac
SINCE_ALERT=$(( NOW - LAST_ALERT ))
if [ "$LAST_ALERT" -gt 0 ] && [ "$SINCE_ALERT" -lt "$REALERT_SECONDS" ]; then
  log "ALARM ${STALE_H}h but within re-alert cooldown (${REALERT_HOURS}h) — not re-sending."
  exit 0
fi

send_alert() {
  if [ "$DRY_RUN" = "1" ]; then
    log "DRY-RUN: would send Telegram alert (bot/chat from $ALERT_ENV):"
    log "DRY-RUN: text: $MSG"
    return 0
  fi
  local bot chat jq_bin payload
  bot=$(grep -E "^BOT_TOKEN=" "$ALERT_ENV" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
  chat=$(grep -E "^CHAT_ID=" "$ALERT_ENV" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
  if [ -z "$bot" ] || [ -z "$chat" ]; then
    log "ERROR: no BOT_TOKEN/CHAT_ID in $ALERT_ENV — cannot alert."
    return 1
  fi
  jq_bin="$(command -v jq)"
  if [ -n "$jq_bin" ]; then
    payload=$(printf '{"chat_id": %s, "text": %s}' "$chat" "$(printf '%s' "$MSG" | "$jq_bin" -Rs .)")
  else
    payload=$(TEXT="$MSG" CHAT="$chat" python3 -c 'import json,os; print(json.dumps({"chat_id": int(os.environ["CHAT"]), "text": os.environ["TEXT"]}))')
  fi
  curl -sS --max-time 10 "https://api.telegram.org/bot${bot}/sendMessage" \
    -H "Content-Type: application/json" -d "$payload" >> "$LOG_FILE" 2>&1
}

log "ALARM: $TARGET heartbeat ${STALE_H}h stale. last=$LAST_HB. Alerting Mario (dry_run=$DRY_RUN)."
if send_alert; then
  echo "$NOW" > "$STATE_FILE" 2>/dev/null || true
fi
exit 0
