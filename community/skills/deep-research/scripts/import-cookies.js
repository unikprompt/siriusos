#!/usr/bin/env node
/**
 * import-cookies.js — load cookies exported from a real browser (via the
 * Cookie-Editor extension) into the agent's Playwright persistent context so
 * deep-research and other browser flows ride on the human's logged-in session.
 *
 * Usage:
 *   node import-cookies.js --agent <name> --json <path> [--domain <suffix>]
 *                          [--instance <id>] [--ctx-root <dir>] [--no-validate]
 *                          [--clear]
 *
 * Defaults:
 *   --agent      $CTX_AGENT_NAME
 *   --instance   $CTX_INSTANCE_ID || "default"
 *   --ctx-root   $CTX_ROOT || ~/.siriusos/<instance>
 *   --domain     no filter (import everything in the JSON)
 *
 * Cookie-Editor JSON shape (per cookie):
 *   { domain, name, value, path, secure, httpOnly, expirationDate?, sameSite,
 *     hostOnly?, session?, storeId? }
 *
 * Playwright addCookies shape:
 *   { name, value, domain|url, path, expires?, httpOnly, secure, sameSite }
 *
 * Exits:
 *   0  success (cookies written, optional validation passed)
 *   1  bad arguments / missing input file
 *   2  Playwright failure (cannot launch context, cannot add cookies)
 *   3  validation failed (Perplexity still asks for sign-in or shows Cloudflare)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const REPO_ROOT = path.resolve(__dirname, '../../../..');

function loadPlaywright() {
  try {
    return require(path.join(REPO_ROOT, 'node_modules', 'playwright'));
  } catch (e) {
    try {
      return require('playwright');
    } catch {
      console.error('[import-cookies] playwright not installed. Run: cd ' + REPO_ROOT + ' && npm install playwright && npx playwright install chromium');
      process.exit(2);
    }
  }
}

function parseArgs(argv) {
  const args = { validate: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) {
        console.error('[import-cookies] flag ' + a + ' requires a value');
        process.exit(1);
      }
      i++;
      return v;
    };
    switch (a) {
      case '--agent': args.agent = next(); break;
      case '--json': args.json = next(); break;
      case '--domain': args.domain = next(); break;
      case '--instance': args.instance = next(); break;
      case '--ctx-root': args.ctxRoot = next(); break;
      case '--no-validate': args.validate = false; break;
      case '--clear': args.clear = true; break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
        break;
      default:
        console.error('[import-cookies] unknown flag: ' + a);
        printUsage();
        process.exit(1);
    }
  }
  return args;
}

function printUsage() {
  console.error([
    'Usage: node import-cookies.js --agent <name> --json <path> [options]',
    '',
    'Required:',
    '  --agent <name>       agent whose persistent context receives the cookies',
    '  --json <path>        Cookie-Editor JSON export (array of cookie objects)',
    '',
    'Options:',
    '  --domain <suffix>    only import cookies whose domain ends with this',
    '                       (e.g. --domain perplexity.ai)',
    '  --instance <id>      cortextOS instance id (default: $CTX_INSTANCE_ID || "default")',
    '  --ctx-root <dir>     override $CTX_ROOT (default: ~/.siriusos/<instance>)',
    '  --no-validate        skip the post-import navigation check',
    '  --clear              clear existing cookies for matched domain before import',
    '',
    'Example:',
    '  node import-cookies.js --agent developer --json ~/Downloads/perplexity.json --domain perplexity.ai',
  ].join('\n'));
}

function resolveContextDir(args) {
  const instance = args.instance || process.env.CTX_INSTANCE_ID || 'default';
  const ctxRoot = args.ctxRoot || process.env.CTX_ROOT || path.join(os.homedir(), '.siriusos', instance);
  return path.join(ctxRoot, 'state', args.agent, 'browser');
}

function normalizeSameSite(raw) {
  if (raw === undefined || raw === null) return 'Lax';
  const s = String(raw).toLowerCase();
  if (s === 'strict') return 'Strict';
  if (s === 'lax') return 'Lax';
  if (s === 'none' || s === 'no_restriction') return 'None';
  if (s === 'unspecified' || s === '') return 'Lax';
  return 'Lax';
}

function mapCookie(c) {
  if (!c || typeof c !== 'object') return null;
  if (!c.name || c.value === undefined || c.value === null) return null;
  if (!c.domain) return null;

  const out = {
    name: String(c.name),
    value: String(c.value),
    domain: String(c.domain),
    path: c.path ? String(c.path) : '/',
    httpOnly: !!c.httpOnly,
    secure: !!c.secure,
    sameSite: normalizeSameSite(c.sameSite),
  };

  if (c.session === true) {
    out.expires = -1;
  } else if (typeof c.expirationDate === 'number' && isFinite(c.expirationDate)) {
    out.expires = Math.floor(c.expirationDate);
  } else if (typeof c.expires === 'number' && isFinite(c.expires)) {
    out.expires = Math.floor(c.expires);
  }

  if (out.sameSite === 'None' && !out.secure) {
    out.secure = true;
  }

  return out;
}

function domainMatches(cookieDomain, suffix) {
  if (!suffix) return true;
  const cd = cookieDomain.replace(/^\./, '').toLowerCase();
  const sx = suffix.replace(/^\./, '').toLowerCase();
  return cd === sx || cd.endsWith('.' + sx);
}

async function clearExistingCookies(context, suffix) {
  if (!suffix) return 0;
  const all = await context.cookies();
  const keep = all.filter(c => !domainMatches(c.domain, suffix));
  const removed = all.length - keep.length;
  await context.clearCookies();
  if (keep.length) await context.addCookies(keep);
  return removed;
}

async function validateSession(context, suffix) {
  const probeUrl = suffix && suffix.includes('perplexity.ai')
    ? 'https://www.perplexity.ai/settings/account'
    : 'https://' + (suffix || 'perplexity.ai').replace(/^\./, '') + '/';

  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  try {
    const resp = await page.goto(probeUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const status = resp ? resp.status() : null;
    const title = await page.title().catch(() => '');
    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 4000)).catch(() => '');

    const cloudflare = /just a moment|cloudflare|checking your browser/i.test(title) || /just a moment|cloudflare/i.test(bodyText);
    const signInPrompt = /sign in to continue|log in to continue|sign in with/i.test(bodyText) && !/sign out|log out/i.test(bodyText);
    const finalUrl = page.url();
    const redirectedToLogin = /\/login|\/signin|\/auth/i.test(finalUrl);

    return {
      ok: !cloudflare && !signInPrompt && !redirectedToLogin,
      status,
      title,
      finalUrl,
      cloudflare,
      signInPrompt,
      redirectedToLogin,
      bodySample: bodyText.slice(0, 200),
    };
  } finally {
    await page.close().catch(() => {});
  }
}

(async () => {
  const args = parseArgs(process.argv.slice(2));

  if (!args.agent) {
    args.agent = process.env.CTX_AGENT_NAME;
    if (!args.agent) {
      console.error('[import-cookies] --agent required (or set $CTX_AGENT_NAME)');
      printUsage();
      process.exit(1);
    }
  }
  if (!args.json) {
    console.error('[import-cookies] --json required');
    printUsage();
    process.exit(1);
  }

  if (!fs.existsSync(args.json)) {
    console.error('[import-cookies] file not found: ' + args.json);
    process.exit(1);
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(args.json, 'utf8'));
  } catch (e) {
    console.error('[import-cookies] invalid JSON in ' + args.json + ': ' + e.message);
    process.exit(1);
  }

  if (!Array.isArray(parsed)) {
    console.error('[import-cookies] expected an array of cookies, got ' + typeof parsed);
    process.exit(1);
  }

  const filtered = args.domain
    ? parsed.filter(c => c && c.domain && domainMatches(c.domain, args.domain))
    : parsed;

  const mapped = filtered.map(mapCookie).filter(Boolean);

  if (mapped.length === 0) {
    console.error('[import-cookies] no usable cookies after filter (input had ' + parsed.length + ', filtered to ' + filtered.length + ')');
    process.exit(1);
  }

  const contextDir = resolveContextDir(args);
  fs.mkdirSync(contextDir, { recursive: true, mode: 0o700 });

  const playwright = loadPlaywright();
  console.error('[import-cookies] launching persistent context: ' + contextDir);
  const context = await playwright.chromium.launchPersistentContext(contextDir, { headless: true });

  let cleared = 0;
  let exitCode = 0;
  try {
    if (args.clear && args.domain) {
      cleared = await clearExistingCookies(context, args.domain);
      console.error('[import-cookies] cleared ' + cleared + ' existing cookies for *.' + args.domain.replace(/^\./, ''));
    }

    await context.addCookies(mapped);
    console.error('[import-cookies] imported ' + mapped.length + ' cookies' + (args.domain ? ' for *.' + args.domain.replace(/^\./, '') : ''));

    const sample = mapped.slice(0, 5).map(c => '  - ' + c.domain + c.path + '  ' + c.name + (c.httpOnly ? ' [HttpOnly]' : '')).join('\n');
    console.error('[import-cookies] sample:\n' + sample + (mapped.length > 5 ? '\n  ... (' + (mapped.length - 5) + ' more)' : ''));

    if (args.validate) {
      console.error('[import-cookies] validating session...');
      const v = await validateSession(context, args.domain || 'perplexity.ai');
      if (v.ok) {
        console.error('[import-cookies] OK — session active. final_url=' + v.finalUrl + ' status=' + v.status);
      } else {
        console.error('[import-cookies] FAIL — session not active.');
        console.error('  status=' + v.status);
        console.error('  final_url=' + v.finalUrl);
        console.error('  title=' + v.title);
        console.error('  cloudflare=' + v.cloudflare + ' sign_in_prompt=' + v.signInPrompt + ' redirected_to_login=' + v.redirectedToLogin);
        console.error('  body_sample=' + v.bodySample);
        exitCode = 3;
      }
    }

    const result = {
      ok: exitCode === 0,
      agent: args.agent,
      context_dir: contextDir,
      imported: mapped.length,
      cleared,
      domain: args.domain || null,
      validated: !!args.validate,
    };
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    console.error('[import-cookies] error: ' + (e && e.message || e));
    exitCode = 2;
  } finally {
    await context.close().catch(() => {});
  }

  process.exit(exitCode);
})();
