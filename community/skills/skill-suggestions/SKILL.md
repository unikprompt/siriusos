---
name: skill-suggestions
description: Detect, review, and approve agent-behavior patterns that might warrant a new skill. Pure observer — never auto-loads anything into the agent.
version: 1
---

# Skill Suggestions

cortextOS scans an agent's recent activity (events, processed inbox, daily memory, completed tasks) for three pattern types and stores candidates in `state/<agent>/skill-suggestions.json`. Approval generates a DRAFT `SKILL.md` in `state/<agent>/skill-drafts/<id>/` — it is **never** auto-loaded into `.claude/skills/`. Promoting a draft to a real skill is a deliberate human/agent step.

This is the safety-gated precursor to a future "Skill Workshop" auto-generator. The detector finds candidates; humans (or the agent in collaboration with the human) decide.

## Pattern types

| Type | Triggers when | Sources |
|---|---|---|
| `trigger-phrase` | A user/agent message contains a hardcoded ES/EN trigger like `from now on`, `siempre acordate de`, `la próxima vez`, `de ahora en adelante`, `next time`, `always remember to`, etc. (1 mention is enough) | processed inbox + daily memory |
| `repeated-sequence` | The same 3-event sequence (within a 30-minute window) appears ≥N times in the last 7 days. Pure-messaging sequences are filtered out as plumbing noise. | analytics events |
| `repeated-task` | ≥N tasks share ≥50% Jaccard similarity on tokenized titles | tasks store |

Defaults: 7-day window, N=3 occurrences.

## Commands

```bash
# Run detector + merge new candidates into the store
cortextos bus skill-suggestions detect --agent <name> --org <org>

# List pending suggestions (human-readable)
cortextos bus skill-suggestions list --agent <name> --status pending --format text

# Inspect one with full evidence
cortextos bus skill-suggestions show <id> --agent <name> --format text

# Approve → writes a DRAFT SKILL.md to state/<agent>/skill-drafts/<id>/
cortextos bus skill-suggestions approve <id> --agent <name>

# Reject → suppresses redetection for 30 days
cortextos bus skill-suggestions reject <id> --agent <name> --reason "..."

# Print pending suggestions formatted for a daily notification (also marks them notified)
cortextos bus skill-suggestions notify --agent <name> --since yesterday --format text
```

All commands accept `--instance <id>` (defaults to `$CTX_INSTANCE_ID` or `default`), `--agent <name>` (defaults to `$CTX_AGENT_NAME`), `--format json|text` (default json).

`detect` additionally accepts `--window-days <n>` (default 7) and `--min-occurrences <n>` (default 3).

`list` accepts `--status <pending|approved|rejected|notified|all>`, `--since <Nd|"yesterday"|ISO>`, `--pattern-type <type>`.

## Lifecycle

```
                 ┌────────────┐
                 │  detect    │ ← cron or ad-hoc
                 └─────┬──────┘
                       ▼
                  pending (in store)
            ┌──────────┼──────────┐
            ▼          ▼          ▼
        approved    rejected    notified
            │          │           │
            ▼          ▼           │
       DRAFT SKILL  cooldown 30d  (human/agent reviews via Telegram)
       (in state/)  (no redetect)
```

A rejected suggestion that is detected again **after** the 30-day cooldown is re-promoted to `pending` (not silently dropped). Rationale: if the pattern keeps reappearing months later, it's worth re-considering.

## Notification flow (recommended)

The orquestador (or any agent) runs `notify --since yesterday --format text` once a day, then forwards the digest to the human via Telegram:

```bash
DIGEST=$(cortextos bus skill-suggestions notify --agent developer --since yesterday --format text)
cortextos bus send-telegram $CHAT_ID "$DIGEST"
```

`notify` marks listed items as `notified` so they are not re-sent the next day.

## Promoting a draft to a real skill

When the human approves a candidate, the draft lives in `state/<agent>/skill-drafts/<id>/SKILL.md`. To promote:

1. Edit the draft — replace the placeholder body with concrete instructions, commands, and guardrails.
2. Move it to `community/skills/<slug>/SKILL.md` (or the agent's framework-specific path) once it is ready.
3. The agent's next session will pick it up via the regular skill discovery path (`cortextos bus list-skills`).

Drafts are **never** auto-promoted. This is the safety boundary between #2 (Skill Suggestion) and the future #5 (Skill Workshop full auto-generation).

## Gating future auto-generation

If/when we ship #5 (auto-write into `.claude/skills/`), the agent's `config.json` will gain:

```json
{
  "skill_suggestions": {
    "auto_write": false
  }
}
```

Until that flag is wired and explicitly enabled per agent, this CLI is observe-and-propose only.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | Generic error (suggestion not found, missing --agent, etc.) |

## When NOT to use this

- During a single session, ad-hoc reflection — just talk to the agent. Skill suggestions are for patterns that **persist** across sessions.
- For trivial habits — a 1-occurrence trigger phrase doesn't always deserve a skill. Use judgement when reviewing.
