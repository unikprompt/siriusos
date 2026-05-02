---
name: obsidian-vault
description: Operate on the Obsidian vault via cortextos bus obsidian. Permission-scoped per agent. Use this instead of direct Bash file writes for any vault path.
version: 1
---

# Obsidian vault operations

cortextOS exposes Obsidian operations through `cortextos bus obsidian <op>` (alias of `cortextos obsidian <op>`). Every agent gets a per-scope allowlist in its `config.json` under `obsidian.scopes`. Operations outside the allowlist fail closed with exit code 3.

**Always prefer this over direct `Write`/`Bash` tool calls to vault paths.** The wrapper handles iCloud locking, scope enforcement, atomic writes, audit logging, and path-escape protection. Hardcoded vault paths break when the user moves the vault.

## Setup (one-time per instance)

`~/.cortextos/<instance>/config/obsidian.json`:

```json
{
  "vault_path": "/absolute/path/to/vault",
  "vault_name": "MyVault",
  "icloud_sync_check": true,
  "lock_timeout_ms": 5000,
  "audit_log": true
}
```

## Per-agent permissions

In the agent's `config.json`:

```json
{
  "obsidian": {
    "scopes": [
      { "paths": ["Projects/Foo/**"], "permissions": ["read", "write", "append"] },
      { "paths": ["Daily/**"], "permissions": ["read", "append"] },
      { "paths": ["**"], "permissions": ["read"] }
    ]
  }
}
```

Most-specific scope wins. No matching scope = deny. `write` does NOT imply `append`; declare both explicitly when needed.

## Commands

```bash
# Write a note (with optional YAML frontmatter)
cortextos bus obsidian write-note "Projects/Foo/note.md" \
  --agent developer \
  --frontmatter '{"tags":["x"],"status":"draft"}' \
  --content "body text"

# Append to an existing note
cortextos bus obsidian append-note "Projects/Foo/log.md" "new entry"

# Append to today's daily note (Daily/YYYY-MM-DD.md)
cortextos bus obsidian append-daily "worked on X today"

# Read a note (frontmatter parsed, body returned)
cortextos bus obsidian read-note "Projects/Foo/note.md"
cortextos bus obsidian read-note "Projects/Foo/note.md" --frontmatter-only

# Find notes by frontmatter tag
cortextos bus obsidian search-by-tag cortextos
cortextos bus obsidian search-by-tag cortextos --folder "Projects/CortexLab"

# List notes in a folder (filters to readable scopes)
cortextos bus obsidian list-notes "Projects/CortexLab" --recursive

# Update a single frontmatter key
cortextos bus obsidian update-frontmatter "Projects/Foo/note.md" status '"published"'
```

All commands accept `--agent <name>` (defaults to `$CTX_AGENT_NAME`) and `--format json|text` (default json).

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | Generic error (config missing, file not found, etc.) |
| 3 | `permission_denied` — scope check failed |
| 4 | `lock_timeout` — could not acquire lock within `lock_timeout_ms` |
| 5 | `path_escape` — requested path resolved outside the vault |

Parse exit code in scripts to handle each case distinctly.

## When NOT to use this

- Reading framework files outside the vault (use `Read` tool).
- Writing to agent state, logs, or memory (those live in `~/.cortextos/<instance>/`, not the vault).
- Quick inspection during debugging — `Read` of an absolute path is fine for one-offs that won't ship.
