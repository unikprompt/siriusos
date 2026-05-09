#!/usr/bin/env bash
# perplexity-search.sh — drive a Perplexity Pro query through the calling
# agent's persistent browser context and print the synthesized answer plus
# the cited sources. See ../SKILL.md for the full contract.
#
# Usage:
#   bash perplexity-search.sh "<query>"
#   bash perplexity-search.sh "<query>" --mode pro|deep
#   bash perplexity-search.sh "<query>" --json    # raw JSON envelope
#
# Exit codes:
#   0  success
#   1  bad arguments / missing dependencies
#   2  browser automation failure
#   3  Perplexity returned an error (cloudflare, login required, empty answer)
set -euo pipefail

if [[ $# -lt 1 ]]; then
  cat >&2 <<USAGE
Usage: $0 "<query>" [--mode pro|deep] [--json]

Examples:
  $0 "Costa Rica AI policy 2026 — current state and gaps"
  $0 "GPT-5.5 vs Claude 4.7 multi-agent benchmarks" --mode deep
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

# Locate the JSON template relative to this script regardless of cwd.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE="$SCRIPT_DIR/perplexity-exec-template.json"
if [[ ! -f "$TEMPLATE" ]]; then
  echo "Template not found at $TEMPLATE" >&2
  exit 1
fi

# Substitute __QUERY__ and __MODE__ into the JSON template using Python (to
# get JSON-safe escaping; sed cannot escape arbitrary input safely).
PAYLOAD="$(QUERY="$QUERY" MODE="$MODE" TEMPLATE="$TEMPLATE" python3 - <<'PY'
import os, json
template = open(os.environ['TEMPLATE']).read()
query = os.environ['QUERY']
mode = os.environ['MODE']
# json.dumps gives us a JSON string literal with proper escaping; strip outer
# quotes since template already has them inline.
q_esc = json.dumps(query)[1:-1]
m_esc = json.dumps(mode)[1:-1]
print(template.replace('__QUERY__', q_esc).replace('__MODE__', m_esc))
PY
)"

START_MS="$(python3 -c 'import time; print(int(time.time()*1000))')"

# Run the browser script. Capture both stdout (JSON envelope) and exit code.
RESULT_JSON="$(echo "$PAYLOAD" | siriusos bus browser exec --from-stdin --format json --timeout 30000 2>&1)"
EXIT_CODE=$?

END_MS="$(python3 -c 'import time; print(int(time.time()*1000))')"
DURATION=$((END_MS - START_MS))

# Parse + render in one Python pass. Pull the answer from the LAST eval
# step's details.result; that's the step that returns answer_text + sources.
# Disable -e for this block so set -e doesn't swallow non-zero python exits
# before we can propagate them.
set +e
RENDERED="$(EXIT_CODE="$EXIT_CODE" DURATION="$DURATION" MODE="$MODE" RAW_JSON="$RAW_JSON" python3 - <<'PY' <<<"$RESULT_JSON"
import json, os, sys
exit_code = int(os.environ.get('EXIT_CODE', '0'))
duration = int(os.environ.get('DURATION', '0'))
mode = os.environ.get('MODE', 'pro')
raw = bool(int(os.environ.get('RAW_JSON', '0')))

raw_text = sys.stdin.read()
try:
    envelope = json.loads(raw_text)
except json.JSONDecodeError:
    sys.stderr.write(f"[deep-research] failed to parse browser output as JSON. Exit code {exit_code}.\n")
    sys.stderr.write(raw_text[:2000] + "\n")
    sys.exit(2)

if not envelope.get('ok', False):
    failing = next((s for s in envelope.get('steps', []) if not s.get('ok')), None)
    sys.stderr.write(f"[deep-research] browser exec failed (step #{envelope.get('steps', []).index(failing)+1 if failing else '?'}):\n")
    sys.stderr.write(json.dumps(failing or envelope, indent=2)[:1500] + "\n")
    sys.exit(2)

# The probe step (step index 2, 0-based) tells us if Cloudflare or login blocked us.
probe = envelope['steps'][2].get('details', {}).get('result', {}) if len(envelope['steps']) > 2 else {}
if (probe.get('title') or '').lower().startswith('just a moment') or 'cloudflare' in (probe.get('title') or '').lower():
    sys.stderr.write("[deep-research] Cloudflare interstitial — re-do the one-time login. See SKILL.md.\n")
    sys.exit(3)
if probe.get('login_required'):
    sys.stderr.write("[deep-research] Perplexity asked for sign-in. Cookies expired — re-do the one-time login.\n")
    sys.exit(3)

# Final eval step holds the result.
final = envelope['steps'][-1].get('details', {}).get('result', {})
answer_text = (final.get('answer_text') or '').strip()
sources = final.get('sources') or []
final_url = final.get('final_url') or envelope.get('final_url') or ''

if not answer_text:
    sys.stderr.write("[deep-research] empty answer — selectors may have moved. Run with --no-headless to inspect.\n")
    sys.exit(3)

result = {
    'ok': True,
    'answer_text': answer_text,
    'sources': sources,
    'mode': mode,
    'duration_ms': duration,
    'final_url': final_url,
}

if raw:
    print(json.dumps(result, ensure_ascii=False, indent=2))
else:
    print('=== ANSWER ===')
    print(answer_text)
    print()
    print('=== SOURCES ===')
    for i, s in enumerate(sources, 1):
        print(f"{i}. {s.get('title','(untitled)')} — {s.get('url','')}")
    print()
    print('=== META ===')
    print(f"mode: {mode}")
    print(f"duration_ms: {duration}")
    print(f"final_url: {final_url}")
PY
)"

# RENDERED is empty when the python script exited non-zero (it sys.exit(N))
# and we have already printed to stderr above. In that case, propagate the
# python exit code via $?.
PY_EXIT=$?
set -e
if [[ -n "$RENDERED" ]]; then
  echo "$RENDERED"
fi
exit $PY_EXIT
