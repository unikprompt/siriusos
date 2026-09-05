---
name: vip-limo-production-rollout
description: Deploy VIP Limo backend and dashboard with approval, migrations, and smoke checks.
created: 2026-08-19
created_by: auto
trigger: "A verified VIP Limo backend/dashboard change is explicitly approved for production deployment."
source_task_id: task_1787101334570_18215170
version: 1
status: draft
---

## Purpose

Deploy the Mac Studio FastAPI backend and Vercel dashboard through the project-specific safety gates. Preserve user changes, verify migrations, and prove the production alias and backend are healthy.

## When to Use

Use after a VIP Limo feature has passed local verification and the owner asks to deploy backend, dashboard, or both. Do not use for ordinary local testing or for activating Limo Anywhere reads/writes that were not included in the approved scope.

## Inputs Required

- `$SCOPE` — backend, dashboard, or both
- `$APPROVAL_ID` — approved deployment authorization
- `$EXPECTED_FLAGS` — production feature flags and their required values
- `$SMOKE_PATHS` — public routes/endpoints to verify

## Steps

1. Confirm the approval status and exact production scope; stop if it is not approved.
2. Inspect `git status` and preserve all unrelated or user-owned changes.
3. Read the current dashboard `AGENTS.md`, deployment configuration, launchd service, and Vercel project link.
4. Run backend tests, compile validation, and `git diff --check`; run dashboard lint, UI contracts, TypeScript, and production build when in scope.
5. Confirm every safety-critical environment flag without printing secrets.
6. For backend scope, restart `com.viplimovoice.backend`, wait for `/health`, inspect startup migration results, and verify required tables/columns.
7. Query APScheduler persistence to ensure disabled jobs are absent when the approved flag is off.
8. For dashboard scope, deploy from the repository root because Vercel's Root Directory is `dashboard`; capture the deployment ID and stable alias.
9. Run public smoke checks against the stable Vercel alias and backend health endpoint, then inspect deployment state.
10. Record deployment evidence, complete the tracked task, update memory, and index the memory files.

## Output

A production rollout with deployment ID, stable URL, backend process/health evidence, schema verification, feature-flag proof, and an auditable completion record.

## Approval Gate

Production restart and Vercel publication require an approved deployment request or an explicit owner decision recorded into that request. Enabling any Limo Anywhere rolling read or writer requires a separate approval when it is outside the deployment scope.

## Notes / Edge Cases

- The health endpoint is `/health`; `/healthz` is protected and can return 401.
- Running Vercel from `dashboard/` duplicates the configured root as `dashboard/dashboard`; deploy from the repository root.
- A disabled scheduler branch does not automatically delete a previously persisted APScheduler job, so verify the job table explicitly.
- The backend uses `venv/bin/python` under launchd even if tests commonly use `.venv/bin/python`.
- Do not commit or push unrelated dirty-worktree files as part of deployment.
