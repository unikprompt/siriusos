#!/usr/bin/env bash
# estimate-burn.sh — wrapper for Node.js CLI
# Estimates token burn for a brief before dispatching it.
#
# Usage:
#   estimate-burn.sh path/to/brief.md [--budget 10000] [--factor 3] [--json]
#   cat brief.md | estimate-burn.sh [--budget 10000]
#
# Heuristic: chars/4 ≈ tokens (English/Spanish ratio), execution multiplier
# defaults to 3x. Exits 0 if total under budget, 1 if it exceeds, 2 on error.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLI="${SCRIPT_DIR}/../dist/cli.js"

exec node "$CLI" bus estimate-burn "$@"
