# AGENTS.md

Context file for AI coding agents (Claude Code, etc.) picking up this repo. Read this first,
then `README.md` for setup/deployment details aimed at the human. This file is about *how
to work on the codebase*, not how to deploy it.

## What this is

Internal release-scheduling app for two record labels (Meanwhile Recordings, Meanwhile
Horizons). A user enters a release → previews a generated task schedule → creates Google
Calendar events, checks Dropbox assets, and drafts a Gmail email. No sending automation,
no database — the `results` git branch is the persistent store.

The app also manages the production workflow: releases live in a local/shared draft state
(Draft → in-progress → scheduled) and the UI surfaces which tasks are upcoming, overdue,
or done for each release.

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
  failure — see git history; the split exists for exactly this reason.)
- **`src/lib/dropbox.ts`** mixes pure functions (`matchReleaseFolderName`, `classifyFile`,
  `buildAssetStatus` — safe anywhere) with an SDK client wrapper (`checkReleaseAssets` and
  friends — server-only by convention). If you ever need Dropbox logic in the browser, split
  this file the same way `calendar.ts` was split.
- **`scripts/*.ts`** are the GitHub Actions entry points. Each one reads `PAYLOAD_JSON` +
  `REQUEST_ID` (+ `DRY_RUN`) from env, does the work, writes `results/{REQUEST_ID}.json`
  via `scripts/lib/result.ts`. The matching `.github/workflows/*.yml` commits that file to
  the `results` branch (via `.github/actions/publish-result`).
- **`src/lib/github-dispatch.ts` + `useWorkflowAction.ts`** are the frontend side of that
  bridge: trigger a workflow, poll the `results` branch for the matching file.
- **Security model**: the browser needs a credential to call the GitHub API
  (`workflow_dispatch` + Contents API writes). The app asks the user to paste a
  fine-grained, repo-scoped GitHub PAT, kept in `sessionStorage` only
  (`src/lib/githubConnection.tsx`). Read README Section 1 before changing anything about
  auth. Don't bake a token into the build or widen its scope — that's a regression.

## Results branch layout

The `results` git branch is the app's persistent store. Nothing else is written to:

```
results/
  releases/
    manifest.json           # ManifestEntry[] — all GitHub Actions-scheduled releases
    data/{cat}.json         # LocalRelease — full release data, written by the frontend
  state/{cat}.json          # ReleaseState — per-release action completion (dropbox/calendar/email)
  settings.json             # AppSettings — editable from /admin, read by every session
  {REQUEST_ID}.json         # GitHub Actions workflow results (transient)
```

Reads use `raw.githubusercontent.com` (unauthenticated, fast). Writes use the GitHub
Contents API with the stored PAT.

## Release state system

Releases have two parallel state tracks:

1. **Draft/shared data** (`LocalRelease` in `src/lib/localReleases.ts`):
   - Created locally, persisted to `localStorage` immediately.
   - When the user has a PAT connected, `useSharedReleases` syncs to
     `releases/data/{cat}.json` on the `results` branch so any device with the PAT can
     see them.
   - `isScheduled: boolean` tracks whether Google Calendar has been populated.

2. **Action state** (`ReleaseState` in `src/lib/types.ts`):
   - Written by the GitHub Actions scripts to `state/{cat}.json` after each action runs.
   - `useReleaseStates` fetches these in parallel for all visible releases.
   - Fields: `coverArtUrl`, `dropbox` (checkedAt), `calendar` (scheduledAt, eventCount),
     `email` (draftedAt).

## Settings system

- **`src/lib/settings.ts`** — `AppSettings` type, `DEFAULT_SETTINGS`, `settingsToTaskRules()`
  (converts `TaskRuleSettings[]` → `TaskRule[]` for use with `generateTasks`).
- **`src/lib/useSettings.tsx`** — `SettingsProvider` context. Loads `settings.json` from the
  `results` branch on mount; saves via GitHub Contents API. Falls back to `DEFAULT_SETTINGS`
  if the file doesn't exist yet.
- **`/admin` page** — UI for editing labels, owners, task rules (toggle/reorder), and feature
  flags (dropbox/calendar/email/recipient). Saving writes `settings.json` to the results branch.
- Every session reads `settings.json` at startup; the task schedule shown to users reflects
  whatever task rules are active in settings.

## Pages and components

**Pages:**
- `/` (`src/pages/index.tsx`) — main release list. Shows local/shared draft releases
  (from `useSharedReleases`) alongside scheduled releases (from `useReleaseManifest`).
  Hovering the date section on a card shows a tooltip with the full task list, coloured
  by past/today/future.
- `/admin` (`src/pages/admin.tsx`) — settings management.
- `/release/[id]` — release detail view (`src/components/ReleaseDetail.tsx`).

**Components** (`src/components/`):
- `PasswordGate.tsx` — simple shared-secret gate. Not real auth — password is in the
  bundle. See README for upgrade options (Cloudflare Access or Clerk recommended).
- `GithubConnectGate.tsx` — PAT entry; stores token in `sessionStorage`.
- `ReleaseForm.tsx` — form for entering release details.
- `ReleasePreview.tsx` — previews the computed task schedule before scheduling.
- `ReleaseDetail.tsx` — detailed release view with action history bar.
- `ArtistAutocomplete.tsx` — artist name suggestions derived from existing releases.

## Shell scripts (macOS, Photoshop automation — not GitHub Actions)

These are separate from the TypeScript `scripts/*.ts` GitHub Actions scripts. They run
locally on the label's Mac and automate Photoshop artwork/video prep. They require
Adobe Photoshop 2026 and zsh.

**`scripts/new-release.sh`** — Sets up Photoshop artwork for a new release:
- Creates `{CAT} - {Artist} - {Title}/assets/images/` under the label's Releases folder
  in Dropbox, copying PSB template files and a template TIF.
- Runs a generated JSX script in Photoshop to update text layers (artist, track names,
  catalogue number) in the template PSBs, then uses AppleScript System Events to click
  "Layer → Smart Objects → Update All Modified Content" (required because Photoshop 2026's
  scripting API doesn't expose `updateAllLinkedContent`).
- Strips macOS quarantine attributes from copied files.
- Usage: `./scripts/new-release.sh` (interactive) or
  `./scripts/new-release.sh MW MW091 "Artist" "Title" "Track 1" "Track 2"`.

**`scripts/export-video-assets.sh`** — Exports per-track PNG backgrounds and mark PNG
for promo videos. Run *after* `new-release.sh` when artwork is finalised:
- The TIF is **not** one flat design — it's several side-by-side Photoshop Artboards
  (Story, 4x5, Cover, FB Banner, SC Banner, Spotify Banner) on one large canvas, each
  with its own independent Mark / TRACK 1 TRACK 2 / Background layers. The script
  targets one named artboard only (`ARTBOARD_NAME`, "Meanwhile Release Cover" for MW).
- `Document.crop()` does not work on documents containing real Photoshop Artboards —
  confirmed by direct testing, it silently no-ops. The script instead hides every
  sibling top-level artboard and uses `Document.trim(TrimType.TRANSPARENT, ...)`,
  which works on pixel bounds rather than artboard metadata.
- The track-name text is a Smart Object (`TRACK 1 TRACK 2` layer), not a plain text
  layer, so it can't be set directly. Its link target is **this release's own**
  `assets/images/{PSB_TRACKS}` (e.g. `MW - track names.psb`) — confirmed via the
  Action Manager `smartObject` descriptor's `link` path. (`new-release.sh`'s own
  comment claiming the link points at the shared template folder is wrong for this
  file — don't trust it without re-checking.) Per track, the script writes that one
  track name into the release's archived PSB, then opens the TIF **fresh** — a
  document that's already open does not pick up the change even after "Update All
  Modified Content"; only a fresh open resolves current linked content — isolates
  the target artboard, hides the Mark smart object, trims, and exports. The archived
  PSB is restored to the full track list afterwards.
- Opens the mark PSB (same release-local-copy convention) and exports `mark.png`
  with transparency to `assets/videos/`.
- Usage: `./scripts/export-video-assets.sh` (interactive) or
  `./scripts/export-video-assets.sh MW MW091`.

**`scripts/relink-video-project.sh`** — Phase 2: relinks a Filmora `.wfp` project file
copied in from a previous release so it points at the current one. Run after copying a
template `.wfp` into `assets/videos/` and after `export-video-assets.sh` has produced
`bg{n}.png`/`mark.png`. Pure file manipulation — no Photoshop involved:
- A `.wfp` is a zip archive. Every media reference (`ProjectFolder/project_info.json`,
  `Medias/medias_info.json`, `Medias/*/media.json`, `Medias/*/timeline.wesproj`) stores
  an **absolute path** back to wherever it was imported from, so a copied `.wfp` still
  points at the old release until relinked.
- Reads `proj_zip_save_path` from `project_info.json` to discover the *old* release
  folder name and project-file "stem" — no hardcoded old catalogue number, works
  whichever release the template was copied from.
- Does a literal substring replace (old release folder → this release's folder, old
  stem → `{CAT_NUMBER}_<same suffix>`) across every `.json`/`.wesproj` text entry,
  leaving binary thumbnails untouched. Matches on the path *without* a leading slash so
  it catches both `/Users/...` and Filmora's `file://Users/...` (note: no third slash)
  forms in one pass.
- Deliberately does **not** touch paths that don't contain the old release folder name —
  e.g. the shared logo at `_MEANWHILE/Assets/Logo/...` or Filmora's own local backup
  cache path (`~/Movies/Wondershare Filmora Mac/Backup/...`) are left alone.
- Rebuilds the zip with `zip -X -D` (no directory entries, matching the original's flat
  16-entries-file structure) under the new stem name, removes the old-named file.
- Leaves mp3 samples alone entirely — those get dropped in and relinked by hand in
  Filmora, then exported. That's intentionally manual.
- Usage: `./scripts/relink-video-project.sh` (interactive) or
  `./scripts/relink-video-project.sh MW MW091`.

**Label config** lives at the top of each shell script (`configure_label()` function) —
MW is fully configured, MWH has placeholder stubs.

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
  and Filmora's local backup cache path correctly left untouched. Not yet confirmed by
  actually opening the result in Filmora itself (only verified by reading the rewritten
  archive's contents back).

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
2. Check `doc/AGENTS.md` (this file) and the memory files in `.claude/` for project context.
3. If continuing artwork/video automation work: all three shell scripts
   (`new-release.sh`, `export-video-assets.sh`, `relink-video-project.sh`) are verified
   end-to-end now. Remaining manual step in the workflow is dropping mp3 samples into
   `assets/videos/` and relinking the two audio clips by hand in Filmora before export.
