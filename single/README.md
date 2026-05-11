# SiriusOS Single

Lite version of [SiriusOS](https://github.com/unikprompt/siriusos). One Telegram agent + Claude Code, running locally on your machine, ready in 5 minutes.

This is the **try-it-out** distribution. When you outgrow it, export your agent and import it into the full SiriusOS for orchestration, dashboard, multi-agent, knowledge base, and more.

## What you get

- A persistent Telegram bot powered by Claude Code (Sonnet / Opus / Haiku)
- Conversation memory across restarts (daily Markdown files in `~/.siriusos-single/<agent>/memory/`)
- Optional local voice transcription (whisper.cpp — no cloud API, no costs)
- Cross-platform: macOS, Linux, Windows
- An export tarball ready for upgrade to SiriusOS full

## What's NOT included (use the full package)

- Multi-agent orchestration
- Dashboard
- PM2 daemon supervision
- Knowledge base / RAG
- Multi-org configuration
- Approvals workflow
- Cron-scheduled tasks

## Requirements

- **Node.js 20+**
- **[Claude Code CLI](https://claude.com/code)** installed and on `PATH` (`claude` command available)
- A **Telegram account** (to create a bot via @BotFather)
- Optional for voice transcription: `whisper-cpp` and `ffmpeg`

## Install

```bash
npm install -g siriusos-single
```

## Quickstart (3 commands)

```bash
# 1. Set up your bot (interactive wizard — ~3 min)
siriusos-single init

# 2. Start the agent
siriusos-single start

# 3. Send your bot a Telegram message. It replies.
```

The `init` wizard walks you through:
1. Creating a Telegram bot with @BotFather
2. Linking your chat to the bot (just send any message)
3. Picking a Claude model (Sonnet / Opus / Haiku)
4. Setting your language for voice transcription

## Voice transcription (optional)

Voice notes get auto-transcribed locally using [whisper.cpp](https://github.com/ggerganov/whisper.cpp) — no API calls, no costs, no data leaving your machine.

**macOS:**
```bash
brew install whisper-cpp ffmpeg
bash <(curl -fsSL https://raw.githubusercontent.com/unikprompt/siriusos/main/scripts/install-whisper-model.sh)
```

**Linux:** build whisper.cpp from source ([instructions](https://github.com/ggerganov/whisper.cpp)), `apt install ffmpeg`.

**Windows:** download whisper.cpp precompiled binaries ([releases](https://github.com/ggerganov/whisper.cpp/releases)) and [ffmpeg](https://ffmpeg.org/download.html).

If you skip this step, voice notes still reach the agent — they just come through as the `.ogg` file path without a transcript.

## Commands

| Command | What it does |
|---|---|
| `siriusos-single init` | Interactive wizard to create a new agent |
| `siriusos-single start [name]` | Boot the agent (Ctrl+C to stop) |
| `siriusos-single status [name]` | Show model, last activity, memory size |
| `siriusos-single export [name]` | Export agent as tarball for upgrade to full |

If you only have one agent configured, `[name]` is optional.

## Where your data lives

```
~/.siriusos-single/
└── <agent_name>/
    ├── .env                  # BOT_TOKEN, CHAT_ID, ALLOWED_USER (NEVER exported)
    ├── config.json           # Model, language, timezone, etc.
    ├── memory/               # YYYY-MM-DD.md transcript files
    ├── local/                # Your custom CLAUDE.md overrides (optional)
    └── state/
        ├── stdout.log        # PTY output log (auto-rotating)
        ├── downloads/        # Telegram media (photos, voice, docs)
        └── .telegram-offset  # Polling cursor (don't edit)
```

Want to add custom instructions for your agent? Drop a `CLAUDE.md` (or any `.md` file) into `~/.siriusos-single/<agent>/local/`. The agent loads them as a system prompt suffix on every restart.

## Upgrading to SiriusOS full

When you want the full multi-agent ecosystem:

```bash
# In siriusos-single:
siriusos-single export
# → Creates <agent>-export.tar.gz in the current directory.

# In your full SiriusOS install (after `npm install -g siriusos` or git clone):
siriusos import-agent <agent>-export.tar.gz
```

The tarball contains your agent's config, memory, and any local overrides. It **does not** contain your `BOT_TOKEN` (you'll re-add that in the full system) or downloaded media (large files).

## Troubleshooting

**"claude: command not found"**
Install Claude Code from https://claude.com/code, then make sure `which claude` succeeds.

**Agent boots but Telegram messages aren't delivered**
Run `siriusos-single status` to confirm the agent is configured. Check `~/.siriusos-single/<agent>/state/stdout.log` for PTY errors. The `BOT_TOKEN` and `CHAT_ID` live in `<agent>/.env`.

**Voice transcription not working**
Either `whisper-cli` or `ffmpeg` isn't on your `PATH`, or the model file isn't at `~/.siriusos/models/ggml-base.bin`. Re-run the install commands from the "Voice transcription" section.

**"Multiple agents configured"**
Pass the agent name explicitly: `siriusos-single start <name>`.

## License

MIT. See [LICENSE](https://github.com/unikprompt/siriusos/blob/main/LICENSE) in the parent repo.
