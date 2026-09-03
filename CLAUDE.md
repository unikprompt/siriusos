# Contributing to SiriusOS

## Development Setup

```bash
git clone https://github.com/unikprompt/siriusos.git
cd siriusos
npm install
npm run build
npm test
```

## Before Submitting Changes

Verify without deploying. These steps type-check, test, and lint the code; none of them touch `dist/`:

1. `npx tsc --noEmit`: TypeScript must compile cleanly (this only type-checks and emits nothing)
2. `npm test`: all tests must pass (vitest runs against `src/`, not `dist/`)
3. `npm run lint`: lint must be clean
4. Match existing patterns in `src/` for new features
5. Add unit tests in `tests/` for any new code

> ⚠️ Do NOT run `npm run build` as a verification step. It overwrites `dist/`, and `dist/cli.js` is the live binary every agent runs (see `bus/` under Project Structure), so a build on ANY branch deploys to the whole fleet regardless of merge or push. `npm run build` is a deploy, not a check. (The `npm run build` under Development Setup above is correct: a first install has to produce `dist/`.) To confirm the bundle still builds, emit to a throwaway directory, never `dist/`.

## Project Structure

- `src/` — TypeScript source (bus, cli, daemon, hooks, types, utils)
- `bus/` — Shell wrapper scripts (delegate to `dist/cli.js bus`)
- `dashboard/` — Next.js 14 web dashboard
- `templates/` — Agent templates (agent, orchestrator, analyst)
- `community/` — Community skills and agent catalog
- `tests/` — Unit, integration, and E2E tests

## Code Style

- TypeScript strict mode
- No external runtime dependencies beyond what's in `package.json`
- File operations use atomic writes (see `src/utils/atomic.ts`)
- All bus operations go through `src/bus/` modules
