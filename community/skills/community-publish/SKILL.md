---
name: community-publish
description: "Package a local skill, agent, or org template for community sharing. Strips PII, scans for secrets, prepares a clean submission, and opens a PR to the community catalog."
triggers: ["publish skill", "share skill", "community submit", "package for sharing", "contribute"]
external_calls: ["github.com"]
---

# Community Publish

Package a local skill, agent template, or org template for sharing with the SiriusOS community. Strips all personal data and opens a PR.

## ⚠️ Mandatory before promoting any draft to community/

**Anything in `community/skills/`, `skills/`, `templates/`, or `landing/` ships to the public GitHub repo. Drafts must pass through this skill before promotion** — the file structure of `community/skills/<slug>/` is identical to drafts under `orgs/<org>/agents/<agent>/skills/drafts/<slug>/`, so it is tempting to move them with `mv` and skip the PII pass. Don't.

If the user (or you) wants a draft promoted:

1. Run `siriusos bus prepare-submission skill ./<draft-path> <slug> --dry-run` first — never `mv`.
2. Read the full PII scan output. Real names, real IDs, real domains, real chat IDs are leaks. Only after the report is clean do you stage anything in `community/skills/`.
3. The pre-commit hook (`scripts/hooks/pre-commit`) is a second line of defense, not the first. Treat it as the floor; this skill is the ceiling.

The original PII leak that motivated this section: an example HTML committed to `community/skills/html-gen/examples/` carried a real IG account ID, real domain, real operator phone reference. Lived publicly until git history was rewritten. Don't repeat.

## When to Run

- When user asks to share a skill
- When the analyst identifies a well-built custom skill worth sharing
- Suggest proactively for skills that have been stable and useful
- **Always before** moving a draft from `orgs/<org>/agents/<agent>/skills/drafts/` to `community/skills/`

## Workflow

### Step 1: Prepare the submission

```bash
# Dry run - shows what would be packaged and any PII found
siriusos bus prepare-submission <type> <source-path> <item-name> --dry-run
```

Types: skill, agent, org

Example:
```bash
siriusos bus prepare-submission skill ./skills/morning-review morning-review --dry-run
```

### Step 2: Review PII scan results

The script scans for:
- Email addresses
- Phone numbers
- API keys and tokens
- Telegram chat IDs
- User names (from USER.md)
- Company names (from context.json)
- Deployment URLs

If PII is found, manually clean the staged files before submitting.

### Step 3: Get user approval

Send via Telegram:
- What is being shared
- Files included
- Any PII warnings
- Ask for explicit "yes" to submit

### Step 4: Submit to community

```bash
# Local submission only (adds to local catalog, no PR)
siriusos bus submit-community-item <item-name> <type> "<description>" --author "<your-name>"

# Full contribution (branch + push to origin + open PR against upstream)
siriusos bus submit-community-item <item-name> <type> "<description>" --author "<your-name>" --contribute
```

The `--contribute` flag:
1. Creates a git branch `community/<item-name>`
2. Copies clean files to community/ directory
3. Adds entry to catalog.json
4. Commits and pushes branch to `origin` (your fork)
5. Opens a PR against `upstream` (canonical SiriusOS repo) via `gh` CLI

### Step 5: Report

Tell the user the PR URL and that it is awaiting community review.

## Config

Requires `ecosystem.community_publish.enabled: true` in config.json.

## Prerequisites

- User must have a fork of the SiriusOS repo configured as `origin`
- `upstream` remote must point to the canonical SiriusOS repo (set during install)
- `gh` CLI must be authenticated (`gh auth login`)

## Safety

- NEVER submits without explicit user approval
- ALWAYS runs PII scan first
- ALWAYS shows dry-run results before real submission
- User reviews every file before it leaves their machine
