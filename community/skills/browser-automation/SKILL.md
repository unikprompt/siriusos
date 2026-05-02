---
name: browser-automation
description: Drive a real browser via Playwright through cortextos bus browser. Per-agent persistent context (cookies, localStorage). Use for sites without APIs, login flows, smoke tests, screenshots.
version: 1
---

# Browser automation

cortextOS exposes browser automation through `cortextos bus browser <action>`. Each agent gets its own persistent browser context (cookies + localStorage + IndexedDB) under `~/.cortextos/<instance>/state/<agent>/browser/`, so login state survives across invocations.

**When to use:** scraping sites without APIs, login flows that lack OAuth, smoke-testing your own dashboards, capturing evidence screenshots, automating repetitive form fills.

**When NOT to use:** sites that have a usable API (always prefer the API), Meta/LinkedIn/IG aggressive scraping (bot detection blocks headless Chromium without stealth plugins), anything requiring CAPTCHA bypass.

## One-time setup

The `playwright` package is an optional dependency. If you haven't yet:

```bash
npm install playwright
npx playwright install chromium
```

Without those, every command fails with a clear error pointing to this setup.

## Single-step commands

Each call launches a browser, runs the action, and closes. Cookies/auth persist via the per-agent context dir.

```bash
# Open a URL and report title/status (validates connectivity, warms the context)
cortextos bus browser open https://example.com

# Click a selector after navigating
cortextos bus browser click "#submit" --url https://example.com/form

# Fill an input
cortextos bus browser fill "#email" "user@example.com" --url https://example.com/login

# Extract text from the first matching element
cortextos bus browser extract "h1" --url https://example.com

# Full-page screenshot
cortextos bus browser screenshot /tmp/page.png --url https://example.com
```

## Multi-step scripts (use this for login flows)

Single commands re-open the page each call, so multi-field flows must use `exec` with a JSON script:

```bash
cat > /tmp/login.json <<'EOF'
[
  {"action": "open", "url": "https://app.example.com/login"},
  {"action": "fill", "selector": "#email", "value": "user@example.com"},
  {"action": "fill", "selector": "#password", "value": "secret"},
  {"action": "click", "selector": "#submit"},
  {"action": "wait", "selector": ".dashboard"},
  {"action": "screenshot", "path": "/tmp/dashboard.png"}
]
EOF
cortextos bus browser exec --file /tmp/login.json
```

Or pipe a script in:

```bash
echo '[{"action":"open","url":"https://example.com"},{"action":"extract","selector":"h1"}]' \
  | cortextos bus browser exec --from-stdin
```

After the login script runs once, the session cookie is saved in the agent's context dir. Subsequent single-step calls (`extract`, `screenshot`) navigate as the logged-in user.

## Available actions

| Action       | Required fields            | Description                                |
|--------------|----------------------------|--------------------------------------------|
| `open`       | `url`                      | Navigate; returns title + HTTP status      |
| `click`      | `selector`                 | Click first matching element               |
| `fill`       | `selector`, `value`        | Fill an input/textarea                     |
| `extract`    | `selector`                 | Wait for + return text content             |
| `wait`       | `selector`                 | Wait for selector to be visible            |
| `screenshot` | `path`                     | Full-page screenshot to disk               |
| `eval`       | `expression`               | Evaluate JS in page context, return result |

Optional per-step `timeout` (ms) overrides the default (10s).

## Common flags

- `--agent <name>` — context is per-agent (default: `$CTX_AGENT_NAME` or `developer`)
- `--instance <id>` — instance scope (default: `$CTX_INSTANCE_ID` or `default`)
- `--no-headless` — show the browser window (debugging only)
- `--timeout <ms>` — override default per-step timeout
- `--format json|text` — output format

## Output

JSON includes per-step results, durations, and the final URL. On failure, `ok: false`, the failing step's `error` field, and process exit code `2`.

```json
{
  "ok": true,
  "agent": "developer",
  "steps": [
    { "action": "open", "ok": true, "details": { "url": "...", "title": "...", "status": 200 }, "duration_ms": 184 },
    { "action": "extract", "ok": true, "details": { "selector": "h1", "text": "..." }, "duration_ms": 18 }
  ],
  "context_dir": "/Users/.../state/developer/browser",
  "final_url": "https://example.com/"
}
```

## Security & secrets

- Context dir is created with mode 0700. Cookies are secrets — treat them like `.env`.
- Never commit a context dir or share screenshots of logged-in state.
- For credentials in scripts, read from env vars and substitute server-side, not from the JSON.

## Known limits (v1)

- No long-running session daemon — each command is a fresh browser launch (~1-3s overhead). Chain multi-step flows via `exec`, not multiple single-step calls.
- No stealth plugin — sites with aggressive bot detection (Meta, LinkedIn, Cloudflare interstitials) will block. Add `playwright-extra` + `puppeteer-extra-plugin-stealth` if needed (out of scope for v1).
- No video recording or HAR capture.
- One page per context (the persistent context's first page); multi-tab flows not supported.
