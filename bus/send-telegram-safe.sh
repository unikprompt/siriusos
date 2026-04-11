#!/usr/bin/env bash
# send-telegram-safe.sh — wrapper for Node.js CLI
# Sends a Telegram message in plain text mode (no Markdown parsing).
# Use this when the message body may contain underscores, asterisks, brackets,
# backticks, or other characters that break Telegram Markdown v1.
#
# Usage: send-telegram-safe.sh <chat_id> <message> [--image /path/to/image] [--file /path/to/file]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLI="${SCRIPT_DIR}/../dist/cli.js"

exec node "$CLI" bus send-telegram-safe "$@"
