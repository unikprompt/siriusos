# Heartbeat Checklist — EXECUTE EVERY STEP. SKIP NOTHING.

This runs on your heartbeat cron (every 4 hours). Execute EVERY step in order.
Skipping steps = broken system.

## Step 1: Liveness ping (DO THIS FIRST)

Quick `update-heartbeat` so the dashboard sees you alive. The full structured update happens in Step 4.

```bash
siriusos bus update-heartbeat "starting heartbeat cycle"
```

If this fails, your agent shows as DEAD on the dashboard. Fix it before anything else.

**Note:** `update-heartbeat` (Step 1) and `log-event heartbeat agent_heartbeat` (Step 4) are NOT interchangeable.
- `update-heartbeat` refreshes the dashboard status-string field (what the dashboard reads to know you're alive).
- `log-event heartbeat …` appends to the activity feed (JSONL append-only event log).

Both are required every cycle. Skipping Step 1 leaves your dashboard view stale even though you're firing events.

## Step 2: Check inbox

```bash
siriusos bus check-inbox
```

Process ALL messages. ACK every single one:
```bash
siriusos bus ack-inbox "<message_id>"
```

Un-ACK'd messages are re-delivered in 5 minutes.
Target: 0 un-ACK'd messages after this step.

## Step 3: Check task queue

```bash
siriusos bus list-tasks --agent $CTX_AGENT_NAME --status pending
siriusos bus list-tasks --agent $CTX_AGENT_NAME --status in_progress
```

- Pending tasks: pick the highest priority one and start it
- In-progress tasks older than 2 hours: complete them or update status with a note
- No tasks: check GOALS.md for objectives, then check with orchestrator

## Step 4: Close the cycle (heartbeat-respond)

Single structured call that wraps update-heartbeat + log-event + update-cron-fire + memory append. Each substep runs independently and partial failures are surfaced in the output.

```bash
siriusos bus heartbeat-respond \
  --status ok \
  --inbox-count <N from Step 2> \
  --tasks-count <N from Step 3> \
  --task "<task_id or empty>" \
  --next "<what you will do next>" \
  --note "<1-line cycle summary>" \
  --cron-interval <match config.json, e.g. 4h>
```

Exit code is 1 if any substep failed. If you see `PARTIAL`, re-run only the failed substep (`update-heartbeat`, `log-event`, `update-cron-fire`, or manual memory append). Skipping cron-fire triggers `Cron gap detected` nudges.

## Step 5: Re-index memory to KB

```bash
siriusos bus kb-ingest ./MEMORY.md ./memory/$(date -u +%Y-%m-%d).md \
  --org $CTX_ORG --agent $CTX_AGENT_NAME --scope private --force
```

## Step 6: Check GOALS.md

Read GOALS.md for any new objectives. If goals changed, create tasks:
```bash
siriusos bus create-task "<title>" --desc "<description>" --assignee $CTX_AGENT_NAME
```

## Step 7: Resume work

Pick your highest priority task and work on it.

```bash
siriusos bus update-task "<task_id>" in_progress
# ... do the work ...
siriusos bus complete-task "<task_id>" "<summary of what was produced>"
```

---

REMINDER: A heartbeat with 0 events logged and 0 memory updates means you did nothing visible.
Target: >= 2 events and >= 1 memory update per heartbeat cycle.
