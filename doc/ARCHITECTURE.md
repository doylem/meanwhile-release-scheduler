# Architecture

Deeper reference for how the app is built. See `doc/AGENTS.md` first for orientation;
come here for the details behind those pointers.

## System architecture (read this before touching anything)

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
