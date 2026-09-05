---
name: next-static-phase-delivery
description: Close a phased Next.js static-site change with local QA, validation, and a scoped commit.
created: 2026-08-20
created_by: auto
trigger: "A user asks to finish one implementation phase of a static Next.js site, inspect it locally, and commit it separately."
source_task_id: task_1787188120719_68798054
version: 1
status: draft
---

## Purpose

Deliver one bounded phase of a static Next.js site without mixing unrelated work. It combines evidence-safe editing, deterministic validation, browser QA, generated-asset review, and a scoped commit while leaving the local preview available.

## When to Use

Use when a repository has `output: 'export'`, the user wants one commit per phase, and the result must be reviewed locally before any deployment. This is especially useful when generated API files or social images belong to the phase.

## Inputs Required

- `$REPO_PATH` — absolute repository path
- `$PHASE_NAME` — user-facing phase name
- `$LOCAL_PORT` — approved free local port
- `$VALIDATION_COMMANDS` — repository-specific data, test, type, lint, and build commands
- `$SENSITIVE_PATHS` — public-content files requiring a pre-commit disclosure audit (optional)
- `$EXCLUDED_PATHS` — unrelated user files that must remain unstaged (optional)

## Steps

1. Read repository instructions and record the exact phase scope, current branch, dirty files, excluded paths, and deployment restriction.
2. Inspect the existing data model and UI before editing. Derive counters and labels from the source of truth instead of duplicating totals.
3. Implement the phase with public strings localized according to repository conventions. Do not fill unknown evidence fields by inference.
4. Add focused tests for derived counters, classification helpers, and any placeholder substitution used in visible copy.
5. Run data validation, unit tests, TypeScript, lint, and `git diff --check`. Record known warnings separately from failures.
6. If both `next dev` and `next build` use the same `.next` directory, stop the dev server before the production build. Restart it afterward on `$LOCAL_PORT`; do not diagnose missing vendor chunks from a build/dev collision as an application defect.
7. Run the production build and confirm the expected locale indexes, phase route, representative detail page, and generated assets exist in `out/`.
8. Use browser QA in a fresh named session. Check desktop and mobile, ES and EN, primary filters/toggles, unresolved `{counter}` placeholders, broken images after lazy loading, page errors, and console errors.
9. If fixed-size capture routes inherit global layout chrome, isolate their canvas at the viewport origin before regenerating assets. Visually inspect representative square, horizontal, and story files.
10. Grep added lines in `$SENSITIVE_PATHS` for prohibited private-plan terms. Inspect every match; do not rely only on a whole-file grep when legacy text is present.
11. Stage only phase files, explicitly preserving `$EXCLUDED_PATHS`. Run `git diff --cached --check` and inspect staged status/stat before committing.
12. Create the requested phase commit, verify the resulting hash and remaining worktree, restart the local preview, and report exact review URLs plus validation results.

## Output

A single scoped commit for the phase, a running local preview, a concise validation summary, and a list of review URLs. Unrelated files remain unstaged and no deployment occurs implicitly.

## Approval Gate

Local edits and validation need no additional approval when they are within the requested phase. Create a commit only when the user explicitly requested phase commits. Never push, deploy, publish, delete user files, or change external systems without explicit authorization.

## Notes / Edge Cases

- A Next.js build can overwrite `.next` while a dev server is using it, producing transient missing-module errors. Restart the dev server after building and retest in a fresh browser session.
- Lazy-loaded previews can appear broken before scrolling; scroll through the page and wait before classifying them as failures.
- Static HTML can contain unresolved dictionary templates inside serialized scripts even when visible copy is resolved. Verify visible DOM text in addition to searching build output.
- Keep generated API timestamps and regenerated images only when the repository convention commits those artifacts.
