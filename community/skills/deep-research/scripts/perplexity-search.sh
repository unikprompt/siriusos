#!/usr/bin/env bash
# perplexity-search.sh — run a Perplexity Sonar query through the official
# API (api.perplexity.ai) and print the synthesized answer plus the cited
# sources. See ../SKILL.md for the full contract.
#
# Usage:
#   bash perplexity-search.sh "<query>"
#   bash perplexity-search.sh "<query>" --mode pro|deep
#   bash perplexity-search.sh "<query>" --json    # raw JSON envelope
#
# Auth:
#   Reads $PERPLEXITY_API_KEY from the environment. The agent daemon loads
#   it from orgs/<org>/agents/<agent>/.env at startup.
#
# Exit codes:
#   0  success
#   1  bad arguments / missing dependencies / missing API key
#   2  API failure (network, 5xx, malformed response)
#   3  Perplexity returned an error (4xx, quota, empty answer)
set -euo pipefail

if [[ $# -lt 1 ]]; then
  cat >&2 <<USAGE
Usage: $0 "<query>" [--mode pro|deep] [--json]

Examples:
  $0 "Costa Rica AI policy 2026 — current state and gaps"
  $0 "GPT-5.5 vs Claude 4.7 multi-agent benchmarks" --mode deep

Required env: PERPLEXITY_API_KEY (set in orgs/<org>/agents/<agent>/.env)
USAGE
  exit 1
fi

QUERY="$1"
shift || true

MODE="pro"
RAW_JSON=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode)
      MODE="${2:-pro}"
      shift 2
      ;;
    --json)
      RAW_JSON=1
      shift
      ;;
    *)
      echo "Unknown flag: $1" >&2
      exit 1
      ;;
  esac
done

if [[ "$MODE" != "pro" && "$MODE" != "deep" ]]; then
  echo "Invalid --mode: $MODE (must be pro or deep)" >&2
  exit 1
fi

if [[ -z "${PERPLEXITY_API_KEY:-}" ]]; then
  cat >&2 <<EOF
[deep-research] PERPLEXITY_API_KEY not set.

Setup:
  1. Create a key at https://www.perplexity.ai/settings/api
  2. Add to orgs/<org>/agents/<agent>/.env:
       PERPLEXITY_API_KEY=pplx-...
  3. Restart the agent so the daemon reloads .env.
EOF
  exit 1
fi

case "$MODE" in
  pro)  MODEL="sonar-pro" ;;
  deep) MODEL="sonar-deep-research" ;;
esac

# Mode-specific timeout. Deep Research can take several minutes.
case "$MODE" in
  pro)  CURL_TIMEOUT=120 ;;
  deep) CURL_TIMEOUT=600 ;;
esac

# Build the request body. Use python3 for safe JSON encoding (sed/printf
# would corrupt embedded quotes, newlines, or unicode in the query).
BODY="$(QUERY="$QUERY" MODEL="$MODEL" python3 - <<'PY'
import json, os
print(json.dumps({
  "model": os.environ["MODEL"],
  "messages": [
    {"role": "user", "content": os.environ["QUERY"]},
  ],
}))
PY
)"

START_MS="$(python3 -c 'import time; print(int(time.time()*1000))')"

# Capture HTTP status separately from body. -w writes the status code
# AFTER the body, then we split. --fail-with-body keeps body on 4xx/5xx.
HTTP_RESPONSE="$(curl -sS \
  --max-time "$CURL_TIMEOUT" \
  --connect-timeout 30 \
  -H "Authorization: Bearer ${PERPLEXITY_API_KEY}" \
  -H "Content-Type: application/json" \
  -X POST "https://api.perplexity.ai/chat/completions" \
  --data "$BODY" \
  -w "\n__HTTP_STATUS__:%{http_code}" 2>&1)" || CURL_EXIT=$?
CURL_EXIT="${CURL_EXIT:-0}"

END_MS="$(python3 -c 'import time; print(int(time.time()*1000))')"
DURATION=$((END_MS - START_MS))

if [[ "$CURL_EXIT" -ne 0 ]]; then
  echo "[deep-research] curl failed (exit $CURL_EXIT) after ${DURATION}ms" >&2
  echo "$HTTP_RESPONSE" | tail -20 >&2
  exit 2
fi

# Split body and status code.
HTTP_STATUS="$(echo "$HTTP_RESPONSE" | awk -F: '/^__HTTP_STATUS__:/ {print $2}')"
RESPONSE_BODY="$(echo "$HTTP_RESPONSE" | sed '/^__HTTP_STATUS__:/d')"

# Stash body in a temp file so the python heredoc below has stdin free for
# its program text (bash collapses double stdin redirects to the last one).
BODY_FILE="$(mktemp -t pplx-body-XXXXXX)"
trap 'rm -f "$BODY_FILE"' EXIT
printf '%s' "$RESPONSE_BODY" > "$BODY_FILE"

set +e
RENDERED="$(HTTP_STATUS="$HTTP_STATUS" DURATION="$DURATION" MODE="$MODE" RAW_JSON="$RAW_JSON" BODY_FILE="$BODY_FILE" python3 - <<'PY'
import json, os, sys
status = int(os.environ.get('HTTP_STATUS', '0') or 0)
duration = int(os.environ.get('DURATION', '0'))
mode = os.environ.get('MODE', 'pro')
raw = bool(int(os.environ.get('RAW_JSON', '0')))
body = open(os.environ['BODY_FILE']).read()

try:
    payload = json.loads(body)
except json.JSONDecodeError:
    sys.stderr.write(f"[deep-research] non-JSON response (HTTP {status}):\n")
    sys.stderr.write(body[:2000] + "\n")
    sys.exit(2)

if status >= 400:
    err = payload.get('error') or payload.get('message') or payload
    sys.stderr.write(f"[deep-research] HTTP {status}: {json.dumps(err)[:1500]}\n")
    if status == 401:
        sys.stderr.write("[deep-research] PERPLEXITY_API_KEY rejected — verify the key at perplexity.ai/settings/api.\n")
    elif status == 402 or status == 429:
        sys.stderr.write("[deep-research] quota or rate limit hit. Check your Perplexity API balance.\n")
    sys.exit(3)

choices = payload.get('choices') or []
if not choices:
    sys.stderr.write(f"[deep-research] no choices in response: {json.dumps(payload)[:1500]}\n")
    sys.exit(3)

answer_text = (choices[0].get('message', {}).get('content') or '').strip()
if not answer_text:
    sys.stderr.write(f"[deep-research] empty answer. Full payload (truncated): {json.dumps(payload)[:1500]}\n")
    sys.exit(3)

# Sources — prefer search_results (newer schema with title+url+date), fall
# back to citations (older schema, just URL strings).
sources = []
search_results = payload.get('search_results')
if isinstance(search_results, list) and search_results:
    seen = set()
    for r in search_results:
        url = (r or {}).get('url') or ''
        if not url or url in seen:
            continue
        seen.add(url)
        sources.append({
            'title': (r.get('title') or url)[:200],
            'url': url,
            'date': r.get('date') or '',
        })
else:
    citations = payload.get('citations') or []
    seen = set()
    for c in citations:
        url = c if isinstance(c, str) else (c or {}).get('url')
        if not url or url in seen:
            continue
        seen.add(url)
        sources.append({'title': url, 'url': url, 'date': ''})

usage = payload.get('usage') or {}

result = {
    'ok': True,
    'answer_text': answer_text,
    'sources': sources,
    'mode': mode,
    'model': payload.get('model') or '',
    'duration_ms': duration,
    'tokens_in': usage.get('prompt_tokens') or 0,
    'tokens_out': usage.get('completion_tokens') or 0,
    'tokens_total': usage.get('total_tokens') or 0,
}

if raw:
    print(json.dumps(result, ensure_ascii=False, indent=2))
else:
    print('=== ANSWER ===')
    print(answer_text)
    print()
    print('=== SOURCES ===')
    for i, s in enumerate(sources, 1):
        date_part = f" ({s['date']})" if s['date'] else ''
        print(f"{i}. {s['title']}{date_part} — {s['url']}")
    if not sources:
        print('(no citations returned)')
    print()
    print('=== META ===')
    print(f"mode: {mode}")
    print(f"model: {result['model']}")
    print(f"duration_ms: {duration}")
    print(f"tokens: in={result['tokens_in']} out={result['tokens_out']} total={result['tokens_total']}")
PY
)"
PY_EXIT=$?
set -e

if [[ -n "$RENDERED" ]]; then
  echo "$RENDERED"
fi
exit $PY_EXIT
