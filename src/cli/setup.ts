/**
 * siriusos setup — interactive first-run wizard.
 *
 * Guides a new user through:
 *   1. Dependency check + state directory creation (install)
 *   2. Org creation (init)
 *   3. Orchestrator agent setup (add-agent --template orchestrator + .env + enable)
 *   4. Optional additional agents (analyst/agent)
 *   5. Ecosystem config generation + daemon start
 */
import { Command } from 'commander';
import { createInterface, type Interface } from 'readline';
import { join } from 'path';
import { homedir } from 'os';
import { spawnSync } from 'child_process';
import { formatValidateError } from '../telegram/api.js';
import {
  validateAgentName,
  validateOrgName,
  writeAgentEnv,
  fetchChatId as fetchChatIdRaw,
  validateTelegramCreds,
  findProjectRoot,
} from '../services/onboarding.js';
import { t as tStrings, format as fmt, detectLocale, isLocale, type CliStrings } from './i18n/index.js';
import type { Locale } from '../types/index.js';

let strings: CliStrings = tStrings('en');

function rl(): Interface {
  return createInterface({ input: process.stdin, output: process.stdout });
}

function ask(iface: Interface, question: string): Promise<string> {
  return new Promise(resolve => iface.question(question, answer => resolve(answer.trim())));
}

function askRequired(iface: Interface, question: string, errorMsg: string): Promise<string> {
  return new Promise(async resolve => {
    while (true) {
      const answer = await ask(iface, question);
      if (answer) {
        resolve(answer);
        return;
      }
      console.log(`  ${errorMsg}`);
    }
  });
}

function askDefault(iface: Interface, question: string, defaultVal: string): Promise<string> {
  return new Promise(resolve =>
    iface.question(`${question} [${defaultVal}]: `, answer => {
      const trimmed = answer.trim();
      resolve(trimmed || defaultVal);
    })
  );
}

function askYN(iface: Interface, question: string, defaultYes = false): Promise<boolean> {
  const hint = defaultYes ? 'Y/n' : 'y/N';
  return new Promise(resolve =>
    iface.question(`${question} [${hint}]: `, answer => {
      const a = answer.trim().toLowerCase();
      if (!a) return resolve(defaultYes);
      resolve(a === 'y' || a === 'yes');
    })
  );
}

function runCli(cwd: string, args: string[], label: string): boolean {
  const cliPath = join(cwd, 'dist', 'cli.js');
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) {
    console.error(`\n  Error during: ${label}`);
    return false;
  }
  return true;
}

/**
 * Wrap the pure service helper so the CLI can echo the detected chat
 * id (or a "couldn't find one" hint) without leaking that UX into the
 * dashboard endpoint that consumes the same probe.
 */
function fetchChatId(botToken: string): string {
  const id = fetchChatIdRaw(botToken);
  if (id) {
    console.log(fmt(strings.telegram.chatIdEcho, { id }));
    return id;
  }
  console.log(strings.telegram.chatIdNotFound);
  return '';
}

/**
 * Probe a BOT_TOKEN + CHAT_ID pair against the live Telegram API before
 * writing the .env to disk. Interactively prompts the user to re-enter the
 * chat id on a hard failure (bad_token is not recoverable here — they need
 * to fix the token outside the wizard and re-run setup).
 *
 * Returns the validated chat id (possibly re-entered) on success, or null
 * if the user gave up. Network errors and rate limits print a WARNING and
 * continue with the original chat id — the enable preflight will re-probe
 * once connectivity is restored.
 */
async function validateTelegramCredsInteractive(
  iface: Interface,
  botToken: string,
  initialChatId: string,
  label: string,
): Promise<string | null> {
  let chatId = initialChatId;
  // Allow up to 3 re-entry attempts before giving up.
  for (let attempt = 0; attempt < 3; attempt++) {
    let result;
    try {
      result = await validateTelegramCreds(botToken, chatId);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.log(fmt(strings.telegram.validationCrashed, { reason }));
      return chatId;
    }

    if (result.ok) {
      const titleHint = result.chatTitle ? ` (${result.chatTitle})` : '';
      console.log(fmt(strings.telegram.validationOk, {
        label,
        bot: result.botUsername,
        chat: chatId,
        type: result.chatType,
        titleHint,
      }));
      return chatId;
    }

    if (result.reason === 'network_error' || result.reason === 'rate_limited') {
      console.log(fmt(strings.telegram.validationWarning, { reason: formatValidateError(result) }));
      return chatId;
    }

    console.log(fmt(strings.telegram.validationFailed, { reason: formatValidateError(result) }));

    if (result.reason === 'bad_token') {
      console.log(strings.telegram.validationBadTokenAdvice);
      return null;
    }

    const answer = await ask(iface, fmt(strings.telegram.differentChatIdPrompt, { label }));
    if (!answer) {
      console.log(strings.telegram.giveUpNoEnv);
      return null;
    }
    chatId = answer;
  }
  console.log(fmt(strings.telegram.tooManyAttempts, { label }));
  return null;
}

export const setupCommand = new Command('setup')
  .option('--instance <id>', 'Instance ID', 'default')
  .option('--lang <locale>', 'UI language for the wizard (en, es). Defaults to LANG/LC_ALL detection.')
  .description('Interactive first-run setup wizard — install, create org, configure agents, start daemon')
  .action(async (options: { instance: string; lang?: string }) => {
    const instanceId = options.instance;
    const projectRoot = findProjectRoot();
    const ctxRoot = join(homedir(), '.siriusos', instanceId);

    const iface = rl();

    // ─── Step 0: Pick language ───────────────────────────────────────────────
    // Precedence: --lang flag > LANG/LC_ALL detection > 'en'. The user can
    // still override interactively. The chosen locale is persisted into the
    // org context after init succeeds.
    let locale: Locale = 'en';
    if (options.lang && isLocale(options.lang)) {
      locale = options.lang;
    } else {
      const detected = detectLocale();
      if (detected) locale = detected;
    }
    if (!options.lang) {
      // Confirm interactively with whatever we detected as default.
      const promptDefault = locale;
      const enStrings = tStrings('en');
      // Show prompt in both languages so a fresh install isn't gated on guessing.
      const promptEn = fmt(enStrings.setup.languagePrompt, { default: promptDefault });
      const answer = (await ask(iface, '\n' + promptEn)).toLowerCase();
      if (isLocale(answer)) {
        locale = answer;
      } else if (answer && answer !== promptDefault) {
        console.log(enStrings.setup.languageInvalid);
        // keep the detected default
      }
    }
    strings = tStrings(locale);

    console.log('\n' + strings.setup.welcomeHeading + '\n');
    console.log(strings.setup.welcomeStep1);
    console.log(strings.setup.welcomeStep2);
    console.log(strings.setup.welcomeStep3);
    console.log(strings.setup.welcomeStep4);
    console.log(strings.setup.welcomeStep5 + '\n');
    console.log(strings.setup.welcomeExitHint + '\n');
    console.log('  ─────────────────────────────────────\n');

    // ─── Step 1: Install ─────────────────────────────────────────────────────

    console.log(strings.setup.step1Title + '\n');
    const installOk = runCli(projectRoot, ['install', '--instance', instanceId], 'siriusos install');
    if (!installOk) {
      console.error('\n' + strings.setup.step1InstallFailed);
      iface.close();
      process.exit(1);
    }

    // ─── Step 2: Org name ────────────────────────────────────────────────────

    console.log('\n  ─────────────────────────────────────\n');
    console.log(strings.setup.step2Title + '\n');
    console.log(strings.setup.step2OrgIntro);
    console.log(strings.setup.step2OrgRules + '\n');

    let orgName = '';
    while (true) {
      orgName = await askRequired(iface, strings.setup.step2OrgPrompt, strings.setup.step2OrgEmpty);
      if (!validateOrgName(orgName)) {
        console.log(strings.setup.step2OrgInvalid);
        continue;
      }
      break;
    }

    const initOk = runCli(projectRoot, ['init', orgName, '--instance', instanceId], 'siriusos init');
    if (!initOk) {
      console.error('\n' + strings.setup.step2InitFailed);
      iface.close();
      process.exit(1);
    }

    // Persist the chosen language into the org context so later commands and
    // the dashboard pick it up. Best-effort — failure here doesn't abort.
    try {
      persistOrgLanguage(projectRoot, orgName, locale);
    } catch (err) {
      console.log(`  (Could not persist language preference: ${err instanceof Error ? err.message : String(err)})`);
    }

    // ─── Step 3: Orchestrator agent ──────────────────────────────────────────

    console.log('\n  ─────────────────────────────────────\n');
    console.log(strings.setup.step3Title + '\n');
    console.log(strings.setup.step3Intro + '\n');
    console.log(strings.setup.step3BotFatherIntro);
    console.log(strings.setup.step3BotFatherSteps + '\n');

    let orchName = '';
    while (true) {
      orchName = await askDefault(iface, strings.setup.step3OrchPrompt, 'boss');
      if (!validateAgentName(orchName)) {
        console.log(strings.setup.step3InvalidName);
        continue;
      }
      break;
    }

    const orchToken = await askRequired(
      iface,
      strings.setup.step3TokenPrompt,
      strings.setup.step3TokenRequired,
    );

    console.log('\n' + strings.setup.step3SendMessageHint + '\n');
    await ask(iface, strings.setup.step3PressEnter);

    let orchChatId = '';
    console.log('\n' + strings.setup.step3FetchingChatId);
    orchChatId = fetchChatId(orchToken);

    if (!orchChatId) {
      orchChatId = await askRequired(iface, strings.setup.step3ChatIdPrompt, strings.setup.step3ChatIdRequired);
    }

    const validatedOrchChatId = await validateTelegramCredsInteractive(
      iface,
      orchToken,
      orchChatId,
      `orchestrator ${orchName}`,
    );
    if (!validatedOrchChatId) {
      console.error('\n' + strings.setup.step3ValidationContinueAbort);
      iface.close();
      process.exit(1);
    }
    orchChatId = validatedOrchChatId;

    const addOrchOk = runCli(
      projectRoot,
      ['add-agent', orchName, '--template', 'orchestrator', '--org', orgName, '--instance', instanceId],
      'siriusos add-agent orchestrator'
    );
    if (!addOrchOk) {
      console.error('\n' + strings.setup.step3AddOrchFailed);
      iface.close();
      process.exit(1);
    }

    const orchDir = join(projectRoot, 'orgs', orgName, 'agents', orchName);
    writeAgentEnv(orchDir, orchToken, orchChatId);
    console.log(fmt(strings.setup.step3WroteEnv, { agent: orchName }));

    const enableOrchOk = runCli(
      projectRoot,
      ['enable', orchName, '--org', orgName, '--instance', instanceId],
      'siriusos enable orchestrator'
    );
    if (!enableOrchOk) {
      console.error('\n' + fmt(strings.setup.step3EnableFailed, { agent: orchName }));
    }

    // ─── Step 4: Additional agents ───────────────────────────────────────────

    console.log('\n  ─────────────────────────────────────\n');
    console.log(strings.setup.step4Title + '\n');
    console.log(strings.setup.step4Intro + '\n');

    const addedAgents: string[] = [orchName];

    while (true) {
      const addMore = await askYN(iface, strings.setup.step4AddMore, false);
      if (!addMore) break;

      let agentName = '';
      while (true) {
        agentName = await askRequired(iface, strings.setup.step4AgentNamePrompt, strings.setup.step4AgentNameRequired);
        if (!validateAgentName(agentName)) {
          console.log(strings.setup.step4AgentNameInvalid);
          continue;
        }
        if (addedAgents.includes(agentName)) {
          console.log(fmt(strings.setup.step4AgentNameDuplicate, { name: agentName }));
          continue;
        }
        break;
      }

      const templateChoices = ['orchestrator', 'analyst', 'agent'];
      let template = await askDefault(iface, fmt(strings.setup.step4TemplatePrompt, { name: agentName }), 'agent');
      if (!templateChoices.includes(template)) template = 'agent';

      console.log('\n' + fmt(strings.setup.step4CreateBotHint, { name: agentName }) + '\n');
      const agentToken = await askRequired(iface, fmt(strings.setup.step4TokenPrompt, { name: agentName }), strings.setup.step3TokenRequired);

      console.log('\n' + fmt(strings.setup.step4SendMessageHint, { name: agentName }));
      await ask(iface, strings.setup.step3PressEnter);

      let agentChatId = '';
      agentChatId = fetchChatId(agentToken);

      if (!agentChatId) {
        agentChatId = await askRequired(iface, fmt(strings.setup.step4ChatIdPrompt, { name: agentName }), strings.setup.step3ChatIdRequired);
      }

      const validatedAgentChatId = await validateTelegramCredsInteractive(
        iface,
        agentToken,
        agentChatId,
        `agent ${agentName}`,
      );
      if (!validatedAgentChatId) {
        console.log(fmt(strings.setup.step4SkippingAgent, { name: agentName }));
        continue;
      }
      agentChatId = validatedAgentChatId;

      const addOk = runCli(
        projectRoot,
        ['add-agent', agentName, '--template', template, '--org', orgName, '--instance', instanceId],
        `siriusos add-agent ${agentName}`
      );

      if (addOk) {
        const agentDir = join(projectRoot, 'orgs', orgName, 'agents', agentName);
        writeAgentEnv(agentDir, agentToken, agentChatId);
        console.log(fmt(strings.setup.step3WroteEnv, { agent: agentName }));

        runCli(projectRoot, ['enable', agentName, '--org', orgName, '--instance', instanceId], `enable ${agentName}`);
        addedAgents.push(agentName);
      }
    }

    // ─── Step 5: Ecosystem + start ───────────────────────────────────────────

    console.log('\n  ─────────────────────────────────────\n');
    console.log(strings.setup.step5Title + '\n');

    const ecoEnv = { ...process.env, CTX_INSTANCE_ID: instanceId, CTX_ORG: orgName };
    const ecoResult = spawnSync(process.execPath, [join(projectRoot, 'dist', 'cli.js'), 'ecosystem', '--instance', instanceId], {
      cwd: projectRoot,
      stdio: 'inherit',
      env: ecoEnv,
    });

    if (ecoResult.status !== 0) {
      console.error(strings.setup.step5EcoFailed);
    } else {
      const pm2Result = spawnSync('pm2', ['start', 'ecosystem.config.js'], {
        cwd: projectRoot,
        stdio: 'inherit',
      });
      if (pm2Result.status === 0) {
        spawnSync('pm2', ['save'], { cwd: projectRoot, stdio: 'inherit' });
        console.log('\n' + strings.setup.step5DaemonStarted);
      } else {
        runCli(projectRoot, ['start', '--instance', instanceId], 'siriusos start');
      }
    }

    // ─── Done ─────────────────────────────────────────────────────────────────

    iface.close();

    console.log('\n  ─────────────────────────────────────\n');
    console.log(strings.setup.completeHeading + '\n');
    console.log(fmt(strings.setup.completeOrg, { org: orgName }));
    console.log(fmt(strings.setup.completeAgents, { agents: addedAgents.join(', ') }));
    console.log(fmt(strings.setup.completeState, { path: ctxRoot }) + '\n');
    console.log(strings.setup.completeNextStepsHeading);
    console.log(strings.setup.completeNextStepStatus);
    console.log(strings.setup.completeNextStepDashboard);
    console.log(strings.setup.completeNextStepLogs);
    console.log(strings.setup.completeNextStepTalk + '\n');
  });

/**
 * Persist the chosen language into orgs/<org>/context.json. Best-effort:
 * if the context file does not exist yet (init was supposed to create it),
 * we create a minimal one with just the language field.
 */
function persistOrgLanguage(projectRoot: string, orgName: string, locale: Locale): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('fs') as typeof import('fs');
  const ctxPath = join(projectRoot, 'orgs', orgName, 'context.json');
  let ctx: Record<string, unknown> = {};
  if (fs.existsSync(ctxPath)) {
    try {
      ctx = JSON.parse(fs.readFileSync(ctxPath, 'utf-8'));
    } catch {
      ctx = {};
    }
  }
  ctx.language = locale;
  fs.writeFileSync(ctxPath, JSON.stringify(ctx, null, 2) + '\n', 'utf-8');
}
