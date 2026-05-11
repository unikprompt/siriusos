import { Command } from 'commander';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir, platform } from 'os';
import { input, select, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import ora from 'ora';
import { TelegramAPI } from '../telegram/api.js';
import { validateAgentName } from '../utils/validate.js';
import { atomicWriteSync } from '../utils/atomic.js';
import type { AgentConfig } from '../types.js';

const SINGLE_HOME = join(homedir(), '.siriusos-single');

export const initCommand = new Command('init')
  .description('Set up your Telegram agent (interactive wizard)')
  .action(async () => {
    console.log();
    console.log(chalk.bold.blue('SiriusOS Single — agent setup wizard'));
    console.log();
    console.log(chalk.dim('You will need:'));
    console.log(chalk.dim('  • Telegram on your phone'));
    console.log(chalk.dim('  • Claude Code CLI installed (https://claude.com/code)'));
    console.log();

    const agentName = await input({
      message: 'Agent name (letters, digits, dashes — used as folder name):',
      default: 'mi-agente',
      validate: (v) => {
        try {
          validateAgentName(v);
          return true;
        } catch (err) {
          return err instanceof Error ? err.message : 'Invalid name';
        }
      },
    });

    const agentDir = join(SINGLE_HOME, agentName);
    if (existsSync(agentDir)) {
      const overwrite = await confirm({
        message: `Directory ${agentDir} already exists. Overwrite config?`,
        default: false,
      });
      if (!overwrite) {
        console.log(chalk.yellow('\nAborted. Pick a different name or remove the existing agent.\n'));
        return;
      }
    }

    // -- BOT_TOKEN ---------------------------------------------------------

    console.log();
    console.log(chalk.bold('Step 1 — Create a Telegram bot'));
    console.log();
    console.log('  1. Open Telegram and message @BotFather');
    console.log('  2. Send /newbot and follow the prompts');
    console.log('  3. Copy the BOT_TOKEN that BotFather gives you');
    console.log();

    const botToken = await input({
      message: 'Paste your BOT_TOKEN:',
      validate: (v) => /^\d+:[\w-]{30,}$/.test(v.trim()) || 'Looks invalid — should be like 123456:ABC-DEF...',
    });

    // Validate the token actually works against Telegram API.
    const validateSpinner = ora('Validating bot token with Telegram...').start();
    const api = new TelegramAPI(botToken.trim());
    let botUsername: string;
    try {
      const me = await api.getMe();
      if (!me?.ok || !me.result?.username) {
        validateSpinner.fail('Bot token rejected by Telegram');
        console.log(chalk.red(`\n  ${me?.description || 'Unknown error from getMe'}\n`));
        return;
      }
      botUsername = me.result.username;
      validateSpinner.succeed(`Bot validated: @${botUsername}`);
    } catch (err) {
      validateSpinner.fail('Could not reach Telegram');
      console.log(chalk.red(`\n  ${err instanceof Error ? err.message : err}\n`));
      return;
    }

    // -- CHAT_ID via getUpdates --------------------------------------------

    console.log();
    console.log(chalk.bold('Step 2 — Connect your chat'));
    console.log();
    console.log(`  Open Telegram and send ANY message to @${botUsername}`);
    console.log('  (the wizard will detect it automatically)');
    console.log();

    const chatId = await waitForFirstMessage(api);
    if (!chatId) {
      console.log(chalk.red('\nTimed out. Send a message to the bot and re-run `siriusos-single init`.\n'));
      return;
    }
    console.log(chalk.green(`  ✓ Detected chat_id: ${chatId}`));

    // -- Model + language --------------------------------------------------

    console.log();
    const model = await select({
      message: 'Which Claude model should your agent use?',
      default: 'claude-sonnet-4-6',
      choices: [
        { name: 'Sonnet 4.6 — fast and capable (recommended)', value: 'claude-sonnet-4-6' },
        { name: 'Opus 4.7 — most capable, slower', value: 'claude-opus-4-7' },
        { name: 'Haiku 4.5 — fastest, cheapest', value: 'claude-haiku-4-5-20251001' },
      ],
    });

    const language = await select({
      message: 'Primary language for voice transcription:',
      default: 'es',
      choices: [
        { name: 'Español', value: 'es' },
        { name: 'English', value: 'en' },
        { name: 'Auto-detect (slower, less accurate on short clips)', value: 'auto' },
      ],
    });

    // -- Write filesystem layout -------------------------------------------

    console.log();
    const writeSpinner = ora('Writing config files...').start();

    mkdirSync(agentDir, { recursive: true });
    mkdirSync(join(agentDir, 'memory'), { recursive: true });
    mkdirSync(join(agentDir, 'state'), { recursive: true });
    mkdirSync(join(agentDir, 'local'), { recursive: true });

    // .env (secrets — never goes into the export tarball)
    const envContent = [
      `BOT_TOKEN=${botToken.trim()}`,
      `CHAT_ID=${chatId}`,
      `ALLOWED_USER=${chatId}`,
      '',
    ].join('\n');
    writeFileSync(join(agentDir, '.env'), envContent, { mode: 0o600 });

    // config.json (safe to export)
    const config: AgentConfig = {
      agent_name: agentName,
      model,
      language,
      created_at: new Date().toISOString(),
      enabled: true,
      provider: 'anthropic',
      runtime: 'claude-code',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
    atomicWriteSync(join(agentDir, 'config.json'), JSON.stringify(config, null, 2));

    writeSpinner.succeed(`Agent created at ${agentDir}`);

    // -- Whisper hint ------------------------------------------------------

    console.log();
    console.log(chalk.bold('Step 3 (optional) — Voice transcription'));
    console.log();
    console.log('  Voice notes will be auto-transcribed if you install whisper.cpp + ffmpeg:');
    console.log();
    if (platform() === 'darwin') {
      console.log(chalk.cyan('    brew install whisper-cpp ffmpeg'));
      console.log(chalk.cyan('    bash <(curl -fsSL https://raw.githubusercontent.com/unikprompt/siriusos/main/scripts/install-whisper-model.sh)'));
    } else if (platform() === 'linux') {
      console.log(chalk.cyan('    # Build whisper.cpp: https://github.com/ggerganov/whisper.cpp'));
      console.log(chalk.cyan('    sudo apt install ffmpeg     # or your distro equivalent'));
    } else {
      console.log(chalk.cyan('    # Download whisper.cpp: https://github.com/ggerganov/whisper.cpp/releases'));
      console.log(chalk.cyan('    # Download ffmpeg: https://ffmpeg.org/download.html'));
    }
    console.log();
    console.log(chalk.dim('  Voice notes work fine without this — the agent just gets the .ogg path.'));

    // -- Done --------------------------------------------------------------

    console.log();
    console.log(chalk.bold.green('All set!'));
    console.log();
    console.log('  Start your agent:');
    console.log(chalk.cyan('    siriusos-single start'));
    console.log();
    console.log('  Then send a Telegram message to your bot. The agent will reply.');
    console.log();
  });

/**
 * Poll getUpdates until we see a message we can extract a chat_id from.
 * Timeout: 5 minutes. Returns null on timeout.
 */
async function waitForFirstMessage(api: TelegramAPI): Promise<number | null> {
  const startedAt = Date.now();
  const timeoutMs = 5 * 60 * 1000;
  let offset = 0;
  const spinner = ora('Waiting for your first message...').start();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await api.getUpdates(offset, 30);
      const updates = Array.isArray(response?.result) ? response.result : [];
      for (const update of updates) {
        offset = Math.max(offset, update.update_id + 1);
        const msg = update.message ?? update.callback_query?.message ?? update.message_reaction;
        if (msg && msg.chat && typeof msg.chat.id === 'number') {
          spinner.stop();
          return msg.chat.id;
        }
      }
    } catch {
      // ignore transient network errors and keep polling
    }
    // small delay to avoid hammering the API on long-poll timeouts
    await new Promise((r) => setTimeout(r, 500));
  }

  spinner.fail('Timeout waiting for first message.');
  return null;
}
