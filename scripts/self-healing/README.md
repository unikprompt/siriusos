# Self-healing watchdog scripts

Optional, opt-in operational scripts that auto-recover a SiriusOS fleet from common failure modes. **These are stop-gaps, not fixes.** They sit alongside SiriusOS rather than modifying its core, and they exist because some upstream bugs are still being worked through (see [open issues](https://github.com/grandamenium/cortextos/issues)).

If you're running an unattended single-operator deployment — or just want Telegram alerts when the daemon does something concerning — these scripts add a meaningful safety net.

## What's here

| Script | Purpose | Cadence |
|---|---|---|
| `watchdog.sh` | Daemon-level. Detects accumulated Telegram poller errors in PM2's daemon error log; restarts the daemon if a threshold of errors accumulates inside a 5-min window. | every 5 min |
| `agent-recover.sh` | Per-agent. Detects agents whose process is alive but stdout has been idle ≥6 min while the daemon is still injecting messages — i.e., a hung PTY. Restarts JUST that agent (no daemon-wide restart) with a 20-min cooldown. | every 5 min |
| `usage-monitor.sh` | Cost. Calls `ccusage blocks --json`, computes USD/hr for the active 5-hour Claude Code session window, sends Telegram alerts on tier transitions (default GREEN <$15, YELLOW $15–$30, RED >$30). | every 30 min |
| `orq-silence-watchdog.sh` | Liveness escalation. Alerts the operator directly by Telegram when a target agent (default `orquestador`) goes dark — the escalation path that does NOT pass through the fleet, because during a real outage the thing that's down is often the orchestrator the fleet escalates to. Catches **two** failure modes: DEAD (`heartbeat.json:last_heartbeat` stops advancing) and WEDGED / alive-but-stuck (the daemon keeps the heartbeat fresh but the agent's own session stops writing its status). Each mode names the right fix (`start` vs `restart --fresh`). Stays quiet on `.user-stop` (intentional stop). | every 30 min |

Each script is matched by a launchd plist template you customize once.

## Install (macOS)

Prerequisites:

- `pm2` (already required by SiriusOS)
- `jq` (already required by SiriusOS)
- `ccusage` for `usage-monitor.sh` only (`npm install -g ccusage`)
- A registered Telegram bot for alerts. By default the scripts auto-detect the first enabled orchestrator's bot from `~/.siriusos/<instance>/config/enabled-agents.json`. You can override with `SIRIUSOS_ALERT_BOT_ENV`.

Steps:

> ⚠️ **These steps install and activate ALL FOUR scripts at once.** The `cp` brace-list, step 2's `*.plist.template` glob, and the `launchctl load` brace-list each cover every script. To adopt only some, replace the brace-list `{watchdog,agent-recover,usage-monitor,orq-silence-watchdog}` (in steps 1 and 3, and the Uninstall) and narrow step 2's glob to just the script(s) you want — e.g. `{orq-silence-watchdog}` — then confirm what actually loaded with `launchctl list | grep siriusos`. Note `usage-monitor` needs `ccusage` and sends cost alerts, so activating it unintentionally is not free.

```bash
# 1. Copy scripts into your local SiriusOS state dir (so they live with your instance, not the repo)
mkdir -p ~/.siriusos/default/scripts ~/.siriusos/default/logs
cp scripts/self-healing/{watchdog,agent-recover,usage-monitor,orq-silence-watchdog}.sh ~/.siriusos/default/scripts/
chmod +x ~/.siriusos/default/scripts/*.sh

# 2. Render plist templates (substitute {USER}, {HOME}, {INSTANCE} for your values, then drop into ~/Library/LaunchAgents)
USER=$(whoami) HOME_DIR="$HOME" INSTANCE=default
for f in scripts/self-healing/*.plist.template; do
  out="$HOME/Library/LaunchAgents/$(basename "${f%.template}")"
  sed -e "s|{USER}|$USER|g" -e "s|{HOME}|$HOME_DIR|g" -e "s|{INSTANCE}|$INSTANCE|g" "$f" > "$out"
done

# 3. Load the launchd jobs
for f in ~/Library/LaunchAgents/com.siriusos.{watchdog,agent-recover,usage-monitor,orq-silence-watchdog}.plist; do
  launchctl load "$f"
done

# 4. Verify
launchctl list | grep siriusos
```

Each script writes to `~/.siriusos/<instance>/logs/<scriptname>.log`. Tail those to see what they're doing.

## Uninstall

```bash
for f in ~/Library/LaunchAgents/com.siriusos.{watchdog,agent-recover,usage-monitor,orq-silence-watchdog}.plist; do
  launchctl unload "$f"
  rm "$f"
done
```

## Tuning

All thresholds live at the top of each script as shell variables — open the script, edit, the next launchd cycle picks up the new values. No restart needed.

### `watchdog.sh`
- `THRESHOLD` (default `150`) — error count in last polling cycle that triggers a restart. Lower if false-negatives bother you, raise if false-positives are firing too often.

### `agent-recover.sh`
- `IDLE_THRESHOLD_SEC` (default `360` / 6 min) — how long stdout must be idle before considering an agent hung
- `COOLDOWN_SEC` (default `1200` / 20 min) — minimum gap between restarts of the same agent

### `usage-monitor.sh`
- `YELLOW_THRESHOLD` (default `15`) and `RED_THRESHOLD` (default `30`) — USD/hr tier boundaries

### `orq-silence-watchdog.sh`
- `ORQ_WATCHDOG_TARGET` (default `orquestador`) — which agent's heartbeat to watch.
- `ORQ_WATCHDOG_STALE_HOURS` (default `9`) — DEAD threshold: alert if `last_heartbeat` is older than this (nothing, not even the daemon's 50-min filler, is writing it). Rationale: the target's heartbeat cron is every 4h, so one legitimately-missed cycle can be up to ~8h; 9h tolerates that one miss (plus ~1h jitter) without a false positive, while still catching a real outage the same day rather than after the ~2-day one that motivated this script.
- `ORQ_WATCHDOG_WEDGE_HOURS` (default = `ORQ_WATCHDOG_STALE_HOURS`) — WEDGED threshold: alert if the agent is alive but stuck. `heartbeat.json:status` is written by two sources — the daemon fast-checker (`[watchdog] <agent> alive …`, every 50 min) and the agent's own session. A wedged session (emitting tool-calls as text, not advancing) keeps a live process, so `last_heartbeat` stays fresh and the DEAD check never fires; but the session stops writing its own status. The watchdog tracks "how long since a session-written status" in a `…session-seen` state file (a single `heartbeat.json` snapshot can't give that history). On the very first run with a daemon-written status it can't know how long the session has been quiet, so it bootstraps to now and logs a visible `BOOTSTRAP:` line — if the agent is already wedged at that moment, the first window is lost, which the log makes diagnosable. The DEAD check runs first (if even the daemon stopped, don't fire two alarms). The two alarms name different fixes on purpose: DEAD → `siriusos start` (`restart` is a no-op on a dead agent); WEDGED → `siriusos restart --fresh` (the process is alive, so there's something to restart).
- **Scope**: defaults to watching only `orquestador`. Other agents have different heartbeat cadences, so widening the wedge check to them risks false positives on an agent that simply had nothing to do — set `ORQ_WATCHDOG_TARGET` per agent and tune the thresholds to that agent's cadence before pointing it at the fleet.
- `ORQ_WATCHDOG_REALERT_HOURS` (default `4`) — while still stale, don't re-alert more often than this (so a multi-hour outage reminds the operator without spamming every 30-min tick).
- `ORQ_WATCHDOG_USERSTOP_CEILING_HOURS` (default `24`) — see the `.user-stop` handling below.
- `ORQ_WATCHDOG_ALERT_ENV` (default: the target agent's own `.env`) — the `.env` whose `BOT_TOKEN`/`CHAT_ID` are used to reach the operator. Defaulting to the target's own bot means the alert lands in the chat where the operator already expects that agent's messages, and the token stays valid even while the agent process is dead.
- `ORQ_WATCHDOG_DRY_RUN` (`1` = print the alert instead of sending it). Use it to preview before activating.
- `.user-stop` handling: if `state/<agent>/.user-stop` exists the operator stopped the agent on purpose, so the watchdog stays quiet — **up to** `ORQ_WATCHDOG_USERSTOP_CEILING_HOURS` (default 24h). Past that ceiling it does NOT stay silent: it sends a *question* ("stopped Nh with `.user-stop` present — intentional, or an orphaned marker?"), not a false alarm. This matters because `.user-stop` can be *orphaned* (it persists across some restarts, a documented behavior of this system); without the ceiling, an orphaned marker during a real outage would silence the watchdog in exactly the case it exists for. A full day stopped on purpose deserves a confirmation anyway.
- It depends only on `bash`, `date`, `sed`, `curl` (and `jq` or `python3` for the send). It does NOT depend on the siriusos daemon or the agent — that's the whole point.

## Caveats

- Only tested on macOS (launchd). A cron-based variant for Linux is straightforward — feel free to PR.
- Scripts assume `pm2` and `jq` on `$PATH`. The plist templates set `PATH` to standard Homebrew + system locations; if your install is non-standard, edit the plists.
- `agent-recover.sh` uses `node $CTX_FRAMEWORK_ROOT/dist/cli.js` to call `siriusos status`. Set `CTX_FRAMEWORK_ROOT` if your install path differs from default.

## Related upstream issues

These scripts compensate for behavior tracked in:
- [#296 — BUG-011 pendingRestarts regression — race still firing](https://github.com/grandamenium/cortextos/issues/296)
- [#326 — Agent PTY silently hangs after Telegram photo injection](https://github.com/grandamenium/cortextos/issues/326)
- [#275 — Dispatcher state machine failure causes exponential gap degradation](https://github.com/grandamenium/cortextos/issues/275)

If those get fixed upstream, you should be able to remove these scripts without losing reliability. Until then, they're a useful safety net.
