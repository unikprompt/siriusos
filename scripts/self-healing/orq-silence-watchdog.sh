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
# TWO SIGNALS, two failure modes:
#  1. DEAD — last_heartbeat age. The heartbeat is written on every cycle
#     (src/bus/heartbeat.ts). Outbound messages are NOT a good signal (some
#     cycles are legitimately silent). If NOTHING writes the heartbeat for N
#     hours — not even the daemon's 50-min filler — the process/daemon is down.
#  2. WEDGED (alive but stuck) — session-status age. heartbeat.json:status is
#     written by two sources: the daemon fast-checker ("[watchdog] <agent> alive
#     …", every 50 min) and the agent's own session. A wedged session (emitting
#     tool-calls as text, not advancing) keeps a LIVE process, so the daemon
#     keeps last_heartbeat fresh and the DEAD signal never fires — but the
#     session stops writing its own status. Tracking "how long since a
#     session-written status" catches it. For the operator, a wedge costs the
#     same as a crash, and the two need DIFFERENT fixes (start vs restart --fresh),
#     which the alert messages spell out.
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

# WEDGE threshold (alive-but-stuck). heartbeat.json:status is written by TWO
# sources: the daemon's fast-checker (status="[watchdog] <agent> alive — idle
# session <ts>", every 50 min) and the agent's own session (any other text, on
# its heartbeat cycle). If the process is alive but the session is wedged
# (emitting tool-calls as text and not advancing — documented in
# reference_wedged_toolcall_loop_fresh_restart), the daemon keeps last_heartbeat
# fresh so the death signal never fires, but the session never writes its own
# status. So "how long since a SESSION-written status" is the wedge signal. Same
# 9h default/reasoning as the death threshold: the session writes at least every
# 4h (and every manual update-heartbeat), so a 9h gap of only daemon fillers is
# unambiguous. For Mario a wedge costs the same as a crash.
WEDGE_HOURS="${ORQ_WATCHDOG_WEDGE_HOURS:-$STALE_HOURS}"
WEDGE_SECONDS=$(( WEDGE_HOURS * 3600 ))

# Paths (all overridable for tests).
HB_FILE="${ORQ_WATCHDOG_HEARTBEAT_FILE:-$ROOT/state/$TARGET/heartbeat.json}"
USER_STOP_FILE="${ORQ_WATCHDOG_USER_STOP_FILE:-$ROOT/state/$TARGET/.user-stop}"
STATE_FILE="${ORQ_WATCHDOG_STATE_FILE:-$ROOT/silence-watchdog-$TARGET.state}"
# Remembers, across runs, the epoch of the last SESSION-written status — the
# history a single heartbeat.json snapshot cannot give us.
SESSION_SEEN_FILE="${ORQ_WATCHDOG_SESSION_SEEN_FILE:-$ROOT/silence-watchdog-$TARGET.session-seen}"
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

# Portable date conversions. macOS ships BSD date (date -j -u -f / date -r);
# Linux and the CI runner ship GNU date (date -u -d). Try the BSD form first,
# fall back to GNU, so the same script — and its test suite — runs on both.
# Only the SCHEDULING of this watchdog is macOS-only (launchd); its logic is
# not, and the CI that guards that logic runs on Linux.
iso_to_epoch() {  # ISO-8601 UTC (2026-01-01T00:00:00Z) -> epoch seconds
  date -j -u -f "%Y-%m-%dT%H:%M:%SZ" "$1" +%s 2>/dev/null \
    || date -u -d "$1" +%s 2>/dev/null
}
epoch_to_iso() {  # epoch seconds -> ISO-8601 UTC
  date -u -r "$1" '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null \
    || date -u -d "@$1" '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null
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

# ISO UTC -> epoch. Portable across BSD (macOS) and GNU (Linux/CI) date.
HB_EPOCH=$(iso_to_epoch "$LAST_HB" || true)
if [ -z "$HB_EPOCH" ]; then
  log "SKIP: could not convert last_heartbeat '$LAST_HB' to epoch — not alarming."
  exit 0
fi

STALE=$(( NOW - HB_EPOCH ))
STALE_H=$(( STALE / 3600 ))

# --- Wedge signal: was the last status written by the daemon or the session? ---
STATUS=$(sed -n 's/.*"status"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$HB_FILE" | head -1)
case "$STATUS" in
  '[watchdog]'*) SESSION_WROTE=0 ;;   # daemon filler
  *)             SESSION_WROTE=1 ;;   # the session itself (a real cycle)
esac

SESSION_SEEN=$(cat "$SESSION_SEEN_FILE" 2>/dev/null || echo "")
case "$SESSION_SEEN" in ''|*[!0-9]*) SESSION_SEEN="" ;; esac
if [ "$SESSION_WROTE" -eq 1 ]; then
  # The session just wrote its own status -> it is running its cycles. Record it.
  SESSION_SEEN="$HB_EPOCH"
  echo "$SESSION_SEEN" > "$SESSION_SEEN_FILE" 2>/dev/null || true
elif [ -z "$SESSION_SEEN" ]; then
  # First run and the status is daemon-written: a single snapshot cannot tell us
  # how long the session has been quiet. Bootstrap to now and START tracking.
  # If the session is ALREADY wedged at this moment, this makes it look healthy
  # and the first wedge window is lost — hence the VISIBLE log line so it is
  # diagnosable from the log rather than guessed.
  SESSION_SEEN="$HB_EPOCH"
  echo "$SESSION_SEEN" > "$SESSION_SEEN_FILE" 2>/dev/null || true
  eff=$(epoch_to_iso "$(( HB_EPOCH + WEDGE_SECONDS ))" || echo "+${WEDGE_HOURS}h")
  log "BOOTSTRAP: first run, no session-seen history for $TARGET. Assuming session alive as of $LAST_HB; wedge detection effective from $eff. (If it is already wedged now, this first window is lost.)"
fi
WEDGE_STALE=$(( NOW - SESSION_SEEN ))
WEDGE_STALE_H=$(( WEDGE_STALE / 3600 ))

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
  # DEAD: nothing writes the heartbeat, not even the daemon's 50-min filler.
  MSG="⚠️ Watchdog: el agente $TARGET lleva ${STALE_H}h sin actualizar su heartbeat (umbral ${STALE_HOURS}h). Última señal: $LAST_HB. El proceso o el daemon están caídos. Acción: siriusos start $TARGET (restart NO sirve en un agente caído, hay que ARRANCARLO)."
elif [ "$WEDGE_STALE" -gt "$WEDGE_SECONDS" ]; then
  # WEDGED: the daemon keeps the heartbeat fresh, but the session has not run a
  # cycle in a long time (only [watchdog] fillers). Alive but stuck.
  SESSION_SEEN_ISO=$(epoch_to_iso "$SESSION_SEEN" || echo "?")
  MSG="⚠️ Watchdog: el agente $TARGET está VIVO (el daemon actualiza su heartbeat) pero su SESIÓN no corre un ciclo hace ${WEDGE_STALE_H}h (umbral ${WEDGE_HOURS}h; último ciclo propio: $SESSION_SEEN_ISO). Probable traba (emite tool-calls como texto sin avanzar); el costo es igual a una caída. Acción: siriusos restart $TARGET --fresh (el proceso está VIVO, hay que reiniciarlo con sesión limpia; 'start' no alcanza acá)."
else
  log "OK: $TARGET heartbeat ${STALE_H}h old, last self-written status ${WEDGE_STALE_H}h old (umbrales ${STALE_HOURS}h / ${WEDGE_HOURS}h). last=$LAST_HB"
  rm -f "$STATE_FILE" 2>/dev/null || true   # healthy/recovered -> clear alert state
  exit 0
fi

# --- ALARM (either a real silence, or a .user-stop past the ceiling). Throttle. ---
LAST_ALERT=$(cat "$STATE_FILE" 2>/dev/null || echo 0)
case "$LAST_ALERT" in ''|*[!0-9]*) LAST_ALERT=0 ;; esac
SINCE_ALERT=$(( NOW - LAST_ALERT ))
if [ "$LAST_ALERT" -gt 0 ] && [ "$SINCE_ALERT" -lt "$REALERT_SECONDS" ]; then
  log "ALARM for $TARGET but within re-alert cooldown (${REALERT_HOURS}h) — not re-sending."
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

log "ALARM: $TARGET (heartbeat ${STALE_H}h / last self-written status ${WEDGE_STALE_H}h). Alerting Mario (dry_run=$DRY_RUN)."
if send_alert; then
  echo "$NOW" > "$STATE_FILE" 2>/dev/null || true
fi
exit 0
