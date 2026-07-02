# Meanwhile Release Scheduler

A small internal app for scheduling release operations for **Meanwhile Recordings** and
**Meanwhile Horizons**. Enter a release, preview the generated task schedule, create Google
Calendar reminders in the shared Meanwhile calendar, check Dropbox for release assets, and
generate a release email draft in Gmail — all without sending anything automatically.

Runs entirely on free infrastructure: **GitHub Pages** (frontend) + **GitHub Actions**
(backend). No server, no VPS, no paid hosting.

---

## 1. Architecture — and the trade-off you should understand before deploying

GitHub Pages only serves static files. It cannot run server-side code or hold secrets. So:

- The **frontend** is a static Next.js export (`next build` with `output: 'export'`),
  deployed to GitHub Pages by `.github/workflows/deploy.yml` on every push to `main`.
- All **privileged work** — talking to Google Calendar, Gmail, and Dropbox — happens inside
  **GitHub Actions workflows**, triggered by the frontend via the GitHub REST API
  (`workflow_dispatch`). The actual API keys live only in **GitHub Repository Secrets**,
  which Actions can read but the browser never can.
- Because `workflow_dispatch` doesn't return data synchronously, each workflow writes its
  result to `results/{request_id}.json` and commits it to a dedicated `results` branch. The
  frontend polls that file (via the GitHub Contents API) until it shows up.

```
Browser (GitHub Pages, static)
   │  workflow_dispatch (with a GitHub PAT)
   ▼
GitHub Actions  ──calls──▶  Google Calendar API / Gmail API / Dropbox API
   │  commits results/{request_id}.json to the "results" branch
   ▼
Browser polls that file and shows the outcome
```

### The trade-off: triggering a workflow from the browser needs *some* credential

`workflow_dispatch` is a GitHub API call, and GitHub API calls require authentication —
there's no way around this for a fully static frontend. This app's security model is:

- The person using the app pastes a **fine-grained GitHub Personal Access Token (PAT)**
  into the app itself, the first time they use it each session.
- That token is scoped to **this one repository only**, with only **Actions: Read & write**
  and **Contents: Read & write** permissions (Contents access is needed so it can read the
  `results` branch). It cannot touch any other repo, can't read your email or other GitHub
  data, and can't do anything Google/Gmail/Dropbox-related directly.
- It's stored in the browser tab's `sessionStorage` only — never written to disk, never
  included in the static build, never sent anywhere except `api.github.com`. Closing the
  tab clears it.
- It is **not** baked into the deployed site. Anyone who opens the site without a token can
  look at the UI but can't trigger any workflow, because every action requires the token to
  be present client-side first.

This is meaningfully different from putting a real API key in the browser: a leaked PAT of
this scope can, at worst, trigger workflow runs and read the `results` branch in *this*
repo — it cannot read your Dropbox, send email as you, or touch your calendar directly,
because it never sees those credentials. Still, treat it like any bearer credential:
generate it with a short expiry, and regenerate if you suspect it leaked.

The simple password gate (`NEXT_PUBLIC_APP_PASSWORD`, see below) is a light deterrent on top
of this, not a substitute for it — anything `NEXT_PUBLIC_*` is baked into the public bundle
and readable by anyone who opens dev tools. Real access control is the PAT requirement.

If this trade-off doesn't sit right with you for your use case, the alternative is a tiny
real backend (e.g. a single Vercel/Cloudflare Worker function) holding the GitHub token
server-side — but that reintroduces a server, which this build deliberately avoids per the
brief. Documented here so it's a decision, not a surprise.

---

## 2. Repository layout

```
config/labels.config.ts   Labels, short codes, catalogue numbers, task rules, owners
src/lib/                  Business logic — scheduling, release ID, dropbox matching,
                          email generation, calendar event builders (pure, unit-tested)
src/lib/calendar.ts       Google Calendar API client (server-only — imports googleapis)
src/lib/gmail.ts          Gmail API client (server-only)
src/lib/dropbox.ts        Dropbox matching logic (pure) + SDK client wrapper
src/lib/github-dispatch.ts  Browser-side helper: triggers workflows, polls for results
src/components/           React UI (form, preview, release detail, gates)
src/pages/                Next.js pages (single-page app: form → preview → detail)
scripts/                  Entry points run by GitHub Actions (create/move/check/email)
tests/                    Vitest unit tests for all business logic
.github/workflows/        deploy.yml + the four privileged-action workflows
.github/actions/publish-result/  Composite action that commits results/*.json
```

Business logic, API integrations, and UI are kept in separate layers on purpose — the same
`src/lib` modules are imported by both the GitHub Actions scripts and (for the pure,
non-networked functions) the frontend, with unit tests covering the logic, not the network
calls.

---

## 3. Local development

```bash
npm install
cp .env.example .env.local   # fill in what you have; leave the rest blank for dry-run/UI work
npm run dev                  # http://localhost:3000 — full UI, but it talks to GitHub Actions,
                             # not local API calls, so calendar/dropbox/email actions need a
                             # real PAT and a deployed repo with secrets configured to do anything
npm test                     # runs the full unit test suite (no network calls, no secrets needed)
```

To test the privileged scripts locally without touching real APIs:

```bash
DRY_RUN=true REQUEST_ID=local-test \
  PAYLOAD_JSON='{"release":{...},"mode":"create-missing"}' \
  npm run script:create-release
```

Dry run mode logs exactly what *would* happen (planned calendar events, Dropbox paths that
would be searched, the generated email body) without calling Google, Gmail, or Dropbox.

---

## 4. Deploying

### One-time GitHub repo setup

1. **Settings → Pages** → Source: "GitHub Actions".
2. **Settings → Actions → General → Workflow permissions** → "Read and write permissions"
   (needed so the four privileged workflows can push to the `results` branch).
3. Add the secrets below under **Settings → Secrets and variables → Actions**.
4. Push to `main`. `.github/workflows/deploy.yml` builds and deploys automatically. Your app
   will be live at `https://<owner>.github.io/<repo>/`.
5. Open the deployed app, paste a fine-grained PAT scoped to this repo (see Section 1), and
   you're ready to create releases.

### Required GitHub Repository Secrets

| Secret | Used by | Notes |
|---|---|---|
| `GOOGLE_CLIENT_ID` | Calendar, Gmail | OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Calendar, Gmail | OAuth client secret |
| `GOOGLE_REFRESH_TOKEN` | Calendar, Gmail | See "Getting a Google refresh token" below |
| `GOOGLE_CALENDAR_ID` | Calendar | The shared Meanwhile calendar's ID (often the calendar owner's email, e.g. `meanwhilerec@gmail.com`) |
| `GAVIN_EMAIL` / `MATTY_EMAIL` / `JAMES_EMAIL` | Calendar | Attendee emails — leave any blank to omit that attendee |
| `ATTENDEE_EMAILS` | Calendar | Optional comma-separated override of the three above |
| `GMAIL_DRAFT_RECIPIENT` | Gmail | Defaults to `meanwhilerec@gmail.com` for testing |
| `DROPBOX_CLIENT_ID` / `DROPBOX_CLIENT_SECRET` / `DROPBOX_REFRESH_TOKEN` | Dropbox | See "Getting a Dropbox refresh token" below |
| `DROPBOX_BASE_PATH` | Dropbox | e.g. `/Meanwhile/Releases` — the folder containing all catalogue folders |
| `APP_PASSWORD` | Deploy workflow | Optional light deterrent (see Section 1) — baked into the public bundle, not a real secret |

The deploy workflow also reads `github.repository_owner` and the repo name automatically to
set `NEXT_PUBLIC_GITHUB_OWNER` / `NEXT_PUBLIC_GITHUB_REPO` — you don't need to set those
yourself.

### Getting a Google refresh token (Calendar + Gmail)

1. In [Google Cloud Console](https://console.cloud.google.com), create a project, enable the
   **Google Calendar API** and **Gmail API**, and create an OAuth 2.0 Client ID
   (type "Web application", with `http://localhost` as an authorized redirect URI for the
   one-time token generation step below).
2. Use Google's [OAuth 2.0 Playground](https://developers.google.com/oauthplayground) (or a
   short local script) with your own client ID/secret, requesting these scopes only:
   - `https://www.googleapis.com/auth/calendar.events` (create/update calendar events —
     deliberately not the broader `calendar` scope, since the app never needs to manage
     calendar settings, only events)
   - `https://www.googleapis.com/auth/gmail.compose` (create/send drafts — deliberately not
     `gmail.modify` or full mailbox access)
3. Authorize as **the Meanwhile Google account** that owns the shared calendar
   (`meanwhilerec@gmail.com`), not your personal account.
4. Exchange the authorization code for tokens; copy the **refresh token** into
   `GOOGLE_REFRESH_TOKEN`. Refresh tokens don't expire under normal use, so you only need to
   do this once (unless you revoke access).

### Getting a Dropbox refresh token

1. Create an app at the [Dropbox App Console](https://www.dropbox.com/developers/apps) with
   **scoped access**, and request these permissions only: `files.metadata.read`,
   `files.content.read`, `sharing.write`, `sharing.read`.
2. Use Dropbox's OAuth flow with `token_access_type=offline` to get a refresh token (their
   [authorization guide](https://developers.dropbox.com/oauth-guide) covers this — the short
   version is: visit the authorize URL, exchange the resulting code for tokens, keep the
   `refresh_token`). The app exchanges this for short-lived access tokens automatically on
   every workflow run (`scripts/lib/dropboxAuth.ts`), so nothing expires on you.
3. `DROPBOX_BASE_PATH` should be the path containing all catalogue folders, e.g.
   `/Meanwhile/Releases` — folder names under it should start with the catalogue number,
   e.g. `MW089 - Alex Orion - Hartseer EP`.

---

## 5. How the privileged workflows work

Each of the four workflows (`create-release.yml`, `move-release.yml`,
`check-dropbox-assets.yml`, `generate-gmail-draft.yml`) takes the same three inputs:

- `payload` — a JSON string with the operation's specific data (release details, catalogue
  number, etc. — see each script's top comment in `scripts/` for its exact shape)
- `request_id` — generated by the frontend, used as the result filename
- `dry_run` — `"true"` to log intended actions without calling any external API

They install dependencies, run the matching `scripts/*.ts` entry point with secrets injected
as environment variables, and commit `results/{request_id}.json` to the `results` branch via
the shared `publish-result` composite action. The frontend (`src/lib/github-dispatch.ts`)
triggers the dispatch and polls for that file.

### Duplicate protection

Every release gets a **stable release ID** (`src/lib/releaseId.ts`) derived from
label + catalogue number + artist + release date, stored in each calendar event's
`extendedProperties.private.releaseId` and in the event description. Before creating events,
`create-release.yml` looks up existing events by that ID and, if any exist, the UI offers:

- **Cancel** — do nothing, just report what already exists
- **Create missing only** — fill in any tasks that don't have an event yet
- **Recreate all events** — delete and recreate every event for this release
- **Update existing events** — update events in place rather than recreate them

### Moving a release date

Release dates are part of the release ID (by design, since changing one is a real change),
so moving a date needs a *different*, date-independent lookup key — `catalogueKey`
(label + catalogue number + artist), also stored in `extendedProperties`. `move-release.yml`
finds existing events by `catalogueKey`, recalculates the whole task schedule against the
new date, and updates each event in place (creating any that are unexpectedly missing)
rather than ever creating duplicates.

---

## 6. Configuration

`config/labels.config.ts` is the single place to edit:

- Label names and short codes (`MW`, `MWH`)
- The latest catalogue number per label (used only as a *suggested* default — manual
  override is always allowed in the form)
- The task schedule (days before release, task titles, owners) — edit this to change due
  dates or owners across the whole catalogue
- The default timezone (`Australia/Melbourne`) and the 9:00–9:15am event window
- Dropbox sub-paths and file extensions used to classify assets
- Seed/upcoming releases shown as quick-pick shortcuts in the form

Secrets (API keys, tokens, calendar ID) are never in this file — see Section 4.

---

## 7. Testing

```bash
npm test
```

Covers: Friday validation, task date generation, Australia/Melbourne timezone handling
(including the AEST/AEDT boundary), catalogue number auto-increment, release ID generation
(and the date-independent catalogue key used by "move release date"), Dropbox folder
matching by catalogue-number prefix and asset classification, and email body generation.
All of it runs with no network calls and no secrets.

---

## 8. Known v1 limitations

- Google Calendar is the source of truth for "does this release have events yet?" — there's
  no separate database. This is intentional per the brief, but means deleting events
  manually in Google Calendar will make the app think they were never created.
- Large files are never downloaded from Dropbox — only shared links are fetched.
- Sending the generated email is a deliberate, separate action from creating the draft; the
  app never sends automatically.
- The password gate is a light deterrent, not real authentication — see Section 1.
