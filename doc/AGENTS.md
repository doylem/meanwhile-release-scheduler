# AGENTS.md

Context file for AI coding agents (Claude Code, etc.) picking up this repo. Read this first,
then `README.md` for setup/deployment details aimed at the human. This file is about *how
to work on the codebase*, not how to deploy it — deeper reference material lives in the
other `doc/` files linked below rather than in here, to keep this one skimmable.

## What this is

Internal release-scheduling app for two record labels (Meanwhile Recordings, Meanwhile
Horizons). A user enters a release → previews a generated task schedule → creates Google
Calendar events, checks Dropbox assets, and drafts a Gmail email. No sending automation,
no database — the `results` git branch is the persistent store.

The app also manages the production workflow: releases live in a local/shared draft state
(Draft → in-progress → scheduled) and the UI surfaces which tasks are upcoming, overdue,
or done for each release.

## Other docs

- **[`doc/ARCHITECTURE.md`](ARCHITECTURE.md)** — system architecture (static frontend +
  GitHub Actions backend, security model), results branch layout, release state system,
  settings system, pages and components. Read this before touching the frontend/backend
  split, auth, or the results-branch data model.
- **[`doc/SHELL_SCRIPTS.md`](SHELL_SCRIPTS.md)** — the macOS Photoshop/Filmora artwork and
  promo-video automation scripts (`new-release.sh`, `export-video-assets.sh`,
  `relink-video-project.sh`). Separate from the TypeScript GitHub Actions scripts below.
  Read this before touching artwork/video automation.

## Conventions

- TypeScript strict mode + `noUncheckedIndexedAccess` is on — array/object index access
  returns `T | undefined`; handle it (non-null assertion only when you've proven it safe).
- Path aliases: `@/*` → `src/*`, `@config/*` → `config/*` (configured in `tsconfig.json`
  and `vitest.config.ts`). Most existing files use relative imports; either works, prefer
  aliases for new files in deep directories.
- Non-secret label/task/owner config lives in `config/labels.config.ts`. Secrets are env
  vars only (`scripts/lib/env.ts` is the validator) — never add a real key/token to any
  config file or to anything prefixed `NEXT_PUBLIC_`.
- Every new piece of scheduling/ID/matching/email logic should be a pure function with a
  Vitest test in `tests/`, following the existing pattern (no mocking, no network).
- Don't add a real backend/server. If a task seems to need one, flag the trade-off first —
  it changes the deployment story (GitHub Pages stops being sufficient).

## Commands

```bash
npm install
npm test              # vitest run — full business-logic suite, no network/secrets
npx tsc --noEmit      # type-check everything (frontend + scripts + tests)
npm run build         # next build, static export to ./out — must succeed with no
                      # "Module not found: fs/net/child_process" errors
npm run dev           # local UI at localhost:3000

# Run a GitHub Actions script locally without touching real APIs:
DRY_RUN=true REQUEST_ID=local-test PAYLOAD_JSON='{...}' npm run script:create-release
DRY_RUN=true REQUEST_ID=local-test PAYLOAD_JSON='{...}' npm run script:move-release
DRY_RUN=true REQUEST_ID=local-test PAYLOAD_JSON='{...}' npm run script:check-dropbox
DRY_RUN=true REQUEST_ID=local-test PAYLOAD_JSON='{...}' npm run script:generate-email
```

Treat a clean `npm test` + `npx tsc --noEmit` + `npm run build` as the bar for "done" on
any change.

## What's been verified vs. what hasn't

Verified:
- All unit tests pass; full type-check is clean; `next build` produces a valid static export.
- All four `scripts/*.ts` entry points run correctly in `DRY_RUN=true` mode.
- `useSharedReleases` localStorage ↔ GitHub sync (local testing).
- Settings round-trip: load defaults → edit in `/admin` → save to results branch → reload.
- Task tooltip on release cards (hover delay, smart viewport positioning, z-index fix for
  footer stacking context — uses `position: fixed` with `getBoundingClientRect()`).
- `new-release.sh` end-to-end on MW releases: PSB text updates, text justification preserved,
  smart-object refresh via AppleScript UI automation.
- `export-video-assets.sh` end-to-end on MW091 (Maze 28 EP, 3 tracks): correct per-track
  `bg{n}.png` (single track name, mark hidden, cropped to the Cover artboard) and `mark.png`.
- `relink-video-project.sh` end-to-end on MW091: relinked a `.wfp` copied from MW090,
  zip integrity verified, all release-scoped paths correctly repointed, shared logo path
  and Filmora's local backup cache path correctly left untouched. Chained automatically
  from `export-video-assets.sh` and confirmed idempotent (no-ops cleanly if already
  relinked). Not yet confirmed by actually opening the result in Filmora itself (only
  verified by reading the rewritten archive's contents back).

**Not yet verified:**
- Real Google Calendar OAuth flow, actual event creation/update/delete, `privateExtendedProperty`
  search against a live calendar.
- Real Gmail draft creation and whether `gmail.compose` scope is sufficient.
- Real Dropbox folder listing/shared-link creation.
- The `results` branch orphan-branch bootstrap path in GitHub Actions (works in theory).
- No React component tests exist — UI is type-checked and built, but not interaction-tested.
- No ESLint config; `next build`'s built-in lint ran without complaint.

## First things to do in a new session

1. `npm install && npm test && npx tsc --noEmit && npm run build` — confirm baseline is
   green before changing anything.
2. Check `doc/AGENTS.md` (this file), the linked docs above, and the memory files in
   `.claude/` for project context.
3. If continuing artwork/video automation work: all three shell scripts are verified
   end-to-end now (see `doc/SHELL_SCRIPTS.md`). Remaining manual step in the workflow is
   dropping mp3 samples into `assets/videos/` and relinking the two audio clips by hand in
   Filmora before export.
