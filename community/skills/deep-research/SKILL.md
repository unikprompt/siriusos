---
name: deep-research
description: Run deep research queries through Perplexity Pro using the agent's persistent browser context. Wraps `siriusos bus browser exec` with the right click/wait/extract sequence for Perplexity's Pro Search and Deep Research modes. Use when an agent needs source-cited research that goes beyond a single web fetch — multi-source synthesis with footnotes, comparable to a 1-2 minute Perplexity session.
triggers: ["deep research", "perplexity", "investiga", "research a fondo", "fuentes citadas", "pro search", "multi-source synthesis"]
tags: [research, browser-automation, perplexity, citations]
version: 1
---

# Deep Research via Perplexity Pro

Routes a query through Perplexity's Pro Search or Deep Research mode using browser automation against the user's logged-in session. Returns the synthesized answer + the cited sources as plain text the agent can paste into a report or further-process.

The agent does not need (and does not have) a Perplexity API key. The skill rides on the human's Pro membership via cookies stored in the agent's browser context.

## When to use

- An agent needs information from beyond its training cutoff with **citations**.
- A topic spans multiple sources and a single `WebFetch` is not enough — Perplexity does the multi-page retrieval + synthesis for you.
- You want **Deep Research** mode (Perplexity's longer multi-step research, ~2-3 minutes) for a high-quality survey on a single topic.

## When NOT to use

- The question can be answered by one canonical source. Use `WebFetch` directly.
- The query is fast/cheap (e.g., "what's the latest version of X"). Use a normal search instead.
- Perplexity has been blocked or rate-limited for this account in the last 30 minutes — back off.

## One-time setup (must be done by the user)

The agent's headless browser cannot solve Cloudflare's interstitial or pass Perplexity's bot challenge on a fresh context. Do the **first** Perplexity visit interactively so the cookie is stored, then headless calls work afterwards.

```bash
# Open Perplexity with the browser visible (Mario must run this)
siriusos bus browser exec --no-headless --from-stdin <<'EOF'
[
  {"action": "open", "url": "https://www.perplexity.ai", "timeout": 60000},
  {"action": "wait", "selector": "textarea", "timeout": 60000}
]
EOF
```

When the window opens:
1. Sign in to Perplexity (Google / email / etc.) so the Pro badge shows.
2. Optionally run a free query so the rate-limit counter ticks normally.
3. Close the window. The session cookie is now persisted in the agent's context dir.

After this, the headless `deep-research` flow below works for ~2-4 weeks (until cookies expire).

To re-login after expiry, repeat the block above.

## How to invoke from an agent

```bash
# Pro Search mode (~30 seconds, single-pass)
bash community/skills/deep-research/scripts/perplexity-search.sh "your query here"

# Deep Research mode (~2-3 minutes, multi-step)
bash community/skills/deep-research/scripts/perplexity-search.sh "your query here" --mode deep
```

Output goes to stdout as:
```
=== ANSWER ===
<the synthesized text from Perplexity>

=== SOURCES ===
1. <title> — <url>
2. <title> — <url>
...

=== META ===
mode: pro|deep
duration_ms: <number>
final_url: <perplexity URL of the result, useful for re-opening>
```

Exit code 0 on success, 2 on browser-automation failure (with the failing-step JSON dumped to stderr).

## Common failure modes

| Symptom | Fix |
|---------|-----|
| "Just a moment..." in title | Cloudflare interstitial — re-do the one-time login (cookies expired) |
| "Sign in to continue" prompt | Same — login expired |
| Empty answer | Selectors moved (Perplexity ships UI changes ~monthly). Re-run with `--no-headless` and inspect the DOM to update `extract` selectors in the script |
| Hit free-tier limit | Wait or upgrade plan. Pro should not hit this with normal usage |
| Timeout on Deep Research | Increase `RESULT_TIMEOUT_MS` (default 240000) in the script |

## Selectors the script depends on

The script targets stable Perplexity DOM elements observed late 2025/early 2026. If Perplexity ships a UI revamp, update these in `scripts/perplexity-search.sh`:

| Purpose | Selector |
|---------|----------|
| Search input | `textarea[placeholder*="Ask"]` |
| Submit button | `button[aria-label*="Submit"]` (fallback: press Enter) |
| Mode dropdown | `button[aria-label*="Search Mode"]` |
| Pro / Deep menu items | text-based via `eval` |
| Answer body | `[class*="prose"]` first match |
| Sources list | `a[class*="citation"]` |

When a selector breaks, the recommended workflow is:
1. `siriusos bus browser exec --no-headless --from-stdin <<<'[{"action":"open","url":"https://www.perplexity.ai/search?q=test"}]'`
2. Inspect the rendered page in DevTools.
3. Update the selector and re-test headless.

## Output structure

Successful run returns a JSON envelope on stdout (parsed by the wrapper script):

```json
{
  "ok": true,
  "answer_text": "Synthesized answer...",
  "sources": [
    {"title": "Source A", "url": "https://..."},
    {"title": "Source B", "url": "https://..."}
  ],
  "mode": "pro",
  "duration_ms": 32145,
  "final_url": "https://www.perplexity.ai/search/abc123"
}
```

The wrapper script renders this as the human-readable text shown above.

## Quotas and politeness

- Perplexity Pro permits 300 queries / day on Pro Search and a smaller daily allowance on Deep Research.
- The skill does NOT batch — call it once per query you actually need answered.
- For batched research workloads (e.g. 50 topics) consider the actual Perplexity API instead of automation, with the user's billing approval.

## Limitations (v1)

- No conversation continuity. Each invocation starts a fresh Perplexity thread; follow-up questions need to be re-prompted with the original context.
- No file upload or image input. Text queries only.
- No control over the source domains Perplexity weights. If you need only `.gov.cr` sources, post-filter the citation URLs.
- Cloudflare/bot-detection vulnerability: if Perplexity tightens detection, headless flows may break globally and require a stealth plugin. Out of scope for v1.

## Files in this skill

- `SKILL.md` — this document
- `scripts/perplexity-search.sh` — the wrapper script that generates the JSON exec payload, calls `siriusos bus browser exec`, parses the result, and renders the human-readable output.
- `scripts/perplexity-exec-template.json` — JSON template for the exec payload (the wrapper does string substitution on `__QUERY__` and `__MODE__`)
