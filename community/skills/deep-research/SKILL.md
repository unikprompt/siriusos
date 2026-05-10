---
name: deep-research
description: Run deep research queries through the Perplexity Sonar API. Wraps `api.perplexity.ai/chat/completions` so an agent can ask a multi-source research question and receive a synthesized answer plus the cited sources. Use when an agent needs information beyond its training cutoff with citations — comparable to a 1-2 minute Perplexity Pro Search or a longer Deep Research run.
triggers: ["deep research", "perplexity", "investiga", "research a fondo", "fuentes citadas", "pro search", "multi-source synthesis", "sonar"]
tags: [research, perplexity, sonar, citations, api]
version: 2
---

# Deep Research via Perplexity Sonar API

Routes a query through the official Perplexity API (`api.perplexity.ai`) and returns the synthesized answer + cited sources as plain text the agent can paste into a report or further-process.

The agent reads `PERPLEXITY_API_KEY` from its environment (loaded by the daemon from the agent's `.env` file). No browser automation, no cookies, no Cloudflare problem.

## When to use

- An agent needs information from beyond its training cutoff with **citations**.
- A topic spans multiple sources and a single `WebFetch` is not enough — Perplexity does the multi-page retrieval + synthesis for you.
- You want **Deep Research** mode (Perplexity's longer multi-step research, ~2-3 minutes) for a high-quality survey on a single topic.

## When NOT to use

- The question can be answered by one canonical source. Use `WebFetch` directly.
- The query is fast/cheap (e.g., "what's the latest version of X"). Use a normal search instead.
- The Perplexity API balance is low or rate-limited (the script reports this clearly on `429`).

## One-time setup

Setup is one human-in-the-loop step: provision an API key.

### Step 1 — Create the API key

1. Go to https://www.perplexity.ai/settings/api
2. Add a payment method if Perplexity asks (the Sonar API is metered separately from the Pro consumer subscription).
3. Click **Create API Key**, name it (e.g. `siriusos-developer`), copy the `pplx-...` value.

### Step 2 — Save it in the agent's `.env`

```bash
# Append to orgs/<org>/agents/<agent>/.env (do NOT commit — .env is gitignored)
echo 'PERPLEXITY_API_KEY=pplx-your-real-key-here' >> orgs/<org>/agents/<agent>/.env
```

### Step 3 — Restart the agent

The daemon loads `.env` on agent start, so a restart is required for the new variable to be available inside the agent's session:

```bash
siriusos stop <agent>
siriusos start <agent>
```

Verify from inside the agent's session:
```bash
test -n "$PERPLEXITY_API_KEY" && echo "key loaded (${#PERPLEXITY_API_KEY} chars)" || echo "MISSING"
```

## How to invoke from an agent

```bash
# Pro Search mode (~10-30 seconds, single-pass with web grounding)
bash community/skills/deep-research/scripts/perplexity-search.sh "your query here"

# Deep Research mode (~2-5 minutes, multi-step research)
bash community/skills/deep-research/scripts/perplexity-search.sh "your query here" --mode deep

# Raw JSON envelope (for further programmatic processing)
bash community/skills/deep-research/scripts/perplexity-search.sh "your query here" --json
```

Pretty output:
```
=== ANSWER ===
<the synthesized text from Perplexity>

=== SOURCES ===
1. <title> (date) — <url>
2. <title> — <url>
...

=== META ===
mode: pro|deep
model: sonar-pro|sonar-deep-research
duration_ms: <number>
tokens: in=<n> out=<n> total=<n>
```

## Models and modes

| Mode flag | Model used | Typical duration | Use when |
|-----------|-----------|------------------|----------|
| `--mode pro` (default) | `sonar-pro` | 10-30 s | Most research questions. Web-grounded answer with citations. |
| `--mode deep` | `sonar-deep-research` | 2-5 min | Multi-step survey of a topic. Slower, deeper, more sources. |

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | Success (answer + sources printed) |
| 1 | Bad arguments / missing `PERPLEXITY_API_KEY` |
| 2 | Network / curl failure / non-JSON response |
| 3 | API returned 4xx, hit a quota, or returned an empty answer |

## Common failure modes

| Symptom | Fix |
|---------|-----|
| `PERPLEXITY_API_KEY not set` | Setup step 2 + 3 above. Restart agent after editing `.env`. |
| HTTP 401 "Invalid API key" | Key was rotated or typed wrong. Regenerate at perplexity.ai/settings/api and update `.env`. |
| HTTP 402 / 429 | Out of API credits or hitting rate limits. Top up balance or wait. |
| `empty answer` | Rare — usually a transient model issue. Retry. If persistent, run with `--json` and inspect the full payload. |
| `curl failed (exit 28)` | Timeout. Default is 120s for `pro`, 600s for `deep`. Deep Research can occasionally exceed this — retry. |
| `non-JSON response` | Perplexity returned an HTML error page (rare, usually a 5xx). Check status.perplexity.com. |

## Output structure (--json envelope)

```json
{
  "ok": true,
  "answer_text": "Synthesized answer...",
  "sources": [
    {"title": "Source A", "url": "https://...", "date": "2026-04-15"},
    {"title": "Source B", "url": "https://...", "date": ""}
  ],
  "mode": "pro",
  "model": "sonar-pro",
  "duration_ms": 32145,
  "tokens_in": 12,
  "tokens_out": 800,
  "tokens_total": 812
}
```

The wrapper script renders this as the human-readable text shown above.

## Quotas and politeness

- Sonar API pricing is per-request + per-token. Check current rates at https://docs.perplexity.ai/guides/pricing.
- The skill does **not** batch — call it once per query you actually need answered.
- For batched research workloads (e.g., 50 topics) consider chunking or budgeting via the orchestrator before launching them in parallel.

## Limitations (v2)

- No conversation continuity. Each invocation is a single user turn; follow-up questions need to be re-prompted with the original context as part of the new query.
- No file upload, image input, or audio. Text queries only.
- No control over which source domains Perplexity weights. If you need only `.gov.cr` sources, post-filter the citation URLs.
- The script does not pass advanced Sonar parameters yet (search_recency_filter, search_domain_filter, return_images, etc.). If you need them, add them to the body and a flag to the wrapper.

## Files in this skill

- `SKILL.md` — this document
- `scripts/perplexity-search.sh` — bash wrapper around the Sonar API. Does arg parsing, builds the JSON request body via python3 (safe escaping), POSTs with curl, parses the response, and renders pretty output or raw JSON. Reads `PERPLEXITY_API_KEY` from env.

## Migration note (v1 → v2)

v1 used Playwright browser automation against perplexity.ai. That approach is dead — Perplexity tightened Cloudflare and Google's OAuth blocks headless browsers, and the cookie-import workaround was fragile across cookie expiry. v2 ditches the browser entirely in favor of the official Sonar API. The wrapper script's CLI contract is preserved (same flags, same `=== ANSWER === / === SOURCES === / === META ===` format), so existing callers continue to work after key setup.
