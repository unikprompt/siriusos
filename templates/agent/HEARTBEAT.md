# Heartbeat Checklist - EXECUTE EVERY STEP. SKIP NOTHING.

This runs on your heartbeat cron (interval defined in `config.json`). Execute EVERY step in order.
Skipping steps = broken system. The dashboard monitors your compliance.

## Step 1: Liveness ping (DO THIS FIRST)

Quick `update-heartbeat` so the dashboard sees you alive while you do the rest of the cycle. The full structured update happens in Step 4.

```bash
cortextos bus update-heartbeat "starting heartbeat cycle"
```

If this fails, your agent shows as DEAD on the dashboard. Fix it before anything else.

## Step 2: Sweep inbox for un-ACK'd messages

Messages arrive in real time via the fast-checker daemon — you don't need to poll for them. This step is a safety sweep for anything that wasn't ACK'd (e.g. a crash mid-processing).

Full reference: `.claude/skills/comms/SKILL.md`

```bash
cortextos bus check-inbox
```

For any messages returned: process and ACK each one:

```bash
cortextos bus ack-inbox "<message_id>"
```

Un-ACK'd messages are re-delivered after 5 minutes. Target: 0 un-ACK'd after this sweep. Remember the count — you'll pass it to Step 4 as `--inbox-count`.

## Step 3: Check task queue + stale task detection

Full reference: `.claude/skills/tasks/SKILL.md`

```bash
cortextos bus list-tasks --agent $CTX_AGENT_NAME --status pending
cortextos bus list-tasks --agent $CTX_AGENT_NAME --status in_progress
```

- If you have pending tasks: pick the highest priority one
- If you have in_progress tasks older than 2 hours: either complete them NOW or update their status with a note
- If you have NO tasks: check GOALS.md for objectives, then message the orchestrator

Stale tasks are visible on the dashboard. They make you look broken. Remember the total count for Step 4 (`--tasks-count`) and the current task ID (`--task`).

## Step 4: Close the cycle (heartbeat-respond)

Single structured call that wraps update-heartbeat + log-event + update-cron-fire + memory append. Each substep runs independently and partial failures are reported in the output (the wrap never silently swallows a failed step).

Full reference: `cortextos bus heartbeat-respond --help`

```bash
cortextos bus heartbeat-respond \
  --status ok \
  --inbox-count <N from Step 2> \
  --tasks-count <N from Step 3> \
  --task "<task_id or empty>" \
  --next "<what you will do next>" \
  --note "<1-line summary of this cycle>" \
  --cron-interval <match your config.json, e.g. 4h>
```

`--status` accepts `ok | degraded | blocked`. Use `degraded` if some substeps in your work failed but you're still operational; `blocked` if you cannot proceed without human input.

Exit code is 1 if any substep (heartbeat / event / cron-fire / memory) failed. If you see `PARTIAL`, read the per-line output to see which one failed and re-run the individual command:

| Substep failed | Re-run |
|----------------|--------|
| `heartbeat: FAIL` | `cortextos bus update-heartbeat "<status>"` |
| `event: FAIL`     | `cortextos bus log-event heartbeat agent_heartbeat info --meta '{...}'` |
| `cron-fire: FAIL` | `cortextos bus update-cron-fire heartbeat --interval <i>` |
| `memory: FAIL`    | manually append to `memory/$(date -u +%Y-%m-%d).md` |

Skipping cron-fire triggers `[SYSTEM] Cron gap detected for "heartbeat"` nudges every 10min — that is why partial-failure visibility matters here.

## Step 5: Check GOALS.md

Read GOALS.md. Goals are refreshed daily by the orchestrator each morning.

- If goals were updated today: you should already have tasks. If not, create them now — see `.claude/skills/tasks/SKILL.md`
- If goals are stale (>24h without update): message the orchestrator to request fresh goals
- If you have no goals: message the orchestrator immediately. Don't idle.

## Step 6: Resume work

Full reference: `.claude/skills/tasks/SKILL.md`

Pick your highest priority task and work on it. Tasks should trace back to your current goals.

When starting:
```bash
cortextos bus update-task "<task_id>" in_progress
```

When done:
```bash
cortextos bus complete-task "<task_id>" --result "<summary of what was produced>"
```

If you are blocked, see `.claude/skills/human-tasks/SKILL.md` for the human task and approval workflow.
If you need an approval before acting, see `.claude/skills/approvals/SKILL.md`.

## Step 7: Guardrail self-check

Full reference: `.claude/skills/guardrails-reference/SKILL.md`

Ask yourself: did I skip any procedures this cycle? Did I rationalize not doing something I should have?

If yes, log it:
```bash
cortextos bus log-event action guardrail_triggered info --meta '{"guardrail":"<which one>","context":"<what happened>"}'
```

If you discovered a new pattern that should be a guardrail, add it to GUARDRAILS.md now.

## Step 8: Update long-term memory (if applicable)

Full reference: `.claude/skills/memory/SKILL.md`

If you learned something this cycle that should persist across sessions:
- Patterns that work/don't work
- User preferences discovered
- System behaviors noted
- Append to MEMORY.md

## Step 9: Re-ingest memory to knowledge base

Full reference: `.claude/skills/knowledge-base/SKILL.md`

Keep your memory collection searchable and current:

```bash
cortextos bus kb-ingest ./MEMORY.md ./memory/$(date -u +%Y-%m-%d).md \
  --org $CTX_ORG --agent $CTX_AGENT_NAME --scope private --force
```

This runs on every heartbeat cycle. It ensures past experiences, user preferences, and learned patterns are semantically searchable for future tasks. Skip if Gemini/KB is not configured for the org.

---

REMINDER: A heartbeat with 0 events logged and 0 memory updates means you did nothing visible.
Target: >= 2 events and >= 1 memory update per heartbeat cycle. `heartbeat-respond` already produces 1 event + 1 memory entry, so meeting the target only requires you to log work events too.
Invisible work is wasted work.
