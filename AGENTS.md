# AGENTS.md

Context file for AI coding agents (Claude Code, etc.) picking up this repo. Read this first,
then `README.md` for setup/deployment details aimed at the human. This file is about *how
to work on the codebase*, not how to deploy it.

## What this is

Internal release-scheduling app for two record labels (Meanwhile Recordings, Meanwhile
Horizons). Person enters a release → previews generated task schedule → creates Google
Calendar events, checks Dropbox assets, and drafts a Gmail email. No sending automation,
no database — Google Calendar is the source of truth.

## Architecture (read this before touching anything)

Static Next.js frontend on GitHub Pages + GitHub Actions as the only backend. There is no
server. This shapes almost every decision in the codebase:

- **`src/lib/*` pure modules** (`scheduling.ts`, `releaseId.ts`, `catalogue.ts`, `email.ts`,
  `dropbox.ts` matching functions, `calendarEvents.ts`) have **no Node-only imports** and
  must stay importable from both the browser bundle and the GitHub Actions scripts. They're
  the unit-tested core — `tests/` only exercises these.
- **`src/lib/calendar.ts`** and **`src/lib/gmail.ts`** are server-only — they import
  `googleapis`, which pulls in `fs`/`net`/`child_process` and will break the static export
  if a frontend file imports them. `calendar.ts` re-exports the pure builders from
  `calendarEvents.ts` for convenience in scripts, but the **frontend must import from
  `calendarEvents.ts` directly**, never from `calendar.ts`. (This already caused one build
  failure during initial build — see git history / the split was made for exactly this
  reason. If you add a new pure builder, put it in `calendarEvents.ts`, not `calendar.ts`.)
- **`src/lib/dropbox.ts`** mixes pure functions (`matchReleaseFolderName`, `classifyFile`,
  `buildAssetStatus` — safe anywhere) with an SDK client wrapper (`checkReleaseAssets` and
  friends — imports the `dropbox` package, server-only by convention even though it hasn't
  caused a build break yet because no frontend file currently imports it). If you ever need
  Dropbox logic in the browser, split this file the same way `calendar.ts` was split.
- **`scripts/*.ts`** are the actual GitHub Actions entry points. Each one: reads
  `PAYLOAD_JSON` + `REQUEST_ID` (+ `DRY_RUN`) from env, does the work, writes
  `results/{REQUEST_ID}.json` via `scripts/lib/result.ts`. The matching `.github/workflows/
  *.yml` runs them and then commits that file to a separate `results` git branch (via
  `.github/actions/publish-result`), since `workflow_dispatch` has no synchronous response.
- **`src/lib/github-dispatch.ts` + `useWorkflowAction.ts`** are the frontend side of that
  bridge: trigger a workflow, poll the `results` branch for the matching file.
- **Security model**: the browser needs a credential to call the GitHub API at all
  (`workflow_dispatch`). The app asks the user to paste a fine-grained, repo-scoped GitHub
  PAT, kept in `sessionStorage` only (`src/lib/githubConnection.tsx`). This is documented in
  detail in `README.md` Section 1 — read it before changing anything about auth. Don't "fix"
  this by baking a token into the build or widening its scope; that's a regression, not a
  simplification.

## Conventions

- TypeScript strict mode + `noUncheckedIndexedAccess` is on — array/object index access
  returns `T | undefined`; handle it (non-null assertion only when you've already proven
  it's safe, as in `tests/taskGeneration.test.ts`).
- Path aliases: `@/*` → `src/*`, `@config/*` → `config/*` (configured in both
  `tsconfig.json` and `vitest.config.ts` — most existing files still use relative imports;
  either is fine, prefer aliases for new files in deep directories).
- Non-secret label/task/owner config lives in `config/labels.config.ts`. Secrets are env
  vars only (`scripts/lib/env.ts` is the validator) — never add a real key/token to any
  config file or to anything prefixed `NEXT_PUBLIC_`.
- Every new piece of scheduling/ID/matching/email logic should be a pure function with a
  Vitest test in `tests/`, following the existing pattern (no mocking, no network — see
  `tests/dropbox.test.ts` for how the SDK-dependent module's pure parts are tested in
  isolation from its network calls).
- Don't add a real backend/server. If a task seems to need one, flag the trade-off to the
  user first (see README Section 1's closing paragraph) rather than silently introducing
  one — it changes the deployment story (GitHub Pages stops being sufficient).

## Commands

```bash
npm install
npm test              # vitest run — full business-logic suite, no network/secrets
npx tsc --noEmit       # type-check everything (frontend + scripts + tests)
npm run build          # next build, static export to ./out — must succeed with no
                       # "Module not found: fs/net/child_process" errors; that error means
                       # a server-only module leaked into a frontend import chain (see above)
npm run dev             # local UI at localhost:3000 (privileged actions still need a real
                       # PAT + deployed repo w/ secrets to actually do anything)

# Run a privileged script locally without touching real APIs:
DRY_RUN=true REQUEST_ID=local-test PAYLOAD_JSON='{...}' npm run script:create-release
DRY_RUN=true REQUEST_ID=local-test PAYLOAD_JSON='{...}' npm run script:move-release
DRY_RUN=true REQUEST_ID=local-test PAYLOAD_JSON='{...}' npm run script:check-dropbox
DRY_RUN=true REQUEST_ID=local-test PAYLOAD_JSON='{...}' npm run script:generate-email
```

Treat a clean `npm test` + `npx tsc --noEmit` + `npm run build` as the bar for "done" on any
change — all three were green when this was handed off; keep them that way.

## What's been verified vs. what hasn't

Verified locally during the initial build:
- All 45 unit tests pass; full type-check is clean; `next build` produces a valid static
  export.
- All four `scripts/*.ts` entry points run correctly end-to-end **in `DRY_RUN=true` mode**
  (no real credentials used) — confirmed task dates, event title/description format, email
  body format, and result-file writing all work as intended.

**Not yet verified** (no real credentials or live deployment were available while building
this) — treat these as the first things to check if something's wrong:
- Real Google Calendar OAuth flow, actual event creation/update/delete, and whether
  `privateExtendedProperty` search behaves as expected against a real calendar.
- Real Gmail draft creation/sending and whether the `gmail.compose` scope is sufficient.
- Real Dropbox folder listing/shared-link creation against an actual account structure.
- The `results` branch git workflow in `.github/actions/publish-result/action.yml` running
  inside actual GitHub Actions (the orphan-branch bootstrap path in particular — works in
  theory, untested in a real Actions run).
- Whether GitHub's fine-grained PAT permissions UI actually exposes "Contents: Read and
  write" + "Actions: Read and write" at the granularity described in the README — re-check
  against GitHub's current UI if anything looks off, since their permissions UI changes.
- No React component tests exist yet (only `src/lib` business logic is unit-tested) — the
  UI has been type-checked and built, but not interaction-tested.
- No ESLint config was added; `next build`'s built-in lint step ran without complaint, but
  there's no dedicated lint script.

## First things to do in a new session

1. `npm install && npm test && npx tsc --noEmit && npm run build` — confirm the baseline is
   still green before changing anything.
2. If picking up where this left off, the natural next step is wiring up real credentials
   (see README Section 4) and testing one workflow end-to-end against a real (ideally
   sandbox/test) calendar, Dropbox folder, and Gmail account before pointing it at production
   data.
