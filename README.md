# Meanwhile Release Scheduler

A lightweight internal tool for coordinating music releases across two record labels —
**[Meanwhile Recordings](https://www.meanwhilerecordings.com)** and **Meanwhile Horizons**.

Enter a release, preview the generated task schedule, create Google Calendar reminders,
verify Dropbox assets, and generate a release email — all from one place, with no
manual copy-pasting across tools.

> **This tool is built specifically for Meanwhile's workflow and is not a general-purpose
> product.** The task rules, labels, owners, and integrations reflect how we operate. If
> you'd like to adapt it for your own label or team, see [Forking & Adapting](#forking--adapting) below.

---

## What it does

When a release is entered, the app:

1. **Generates a task schedule** — a fixed set of deadlines (masters due, artwork due, promo upload, teasers, release day) calculated back from the release date, each assigned to a team member
2. **Creates Google Calendar events** — one event per task, added to the shared Meanwhile calendar with attendees and popup reminders
3. **Checks Dropbox** — scans the release folder for masters, artwork, videos, and other assets, and surfaces shared links for each
4. **Generates a release email draft** — pre-filled Gmail draft to the distributor with the tracklist, links, and royalty details

Nothing sends automatically. Every action requires a deliberate click. The tool is a coordinator, not an automaton.

---

## How it works

The frontend is a static [Next.js](https://nextjs.org) app hosted on **GitHub Pages** — no server,
no database. All privileged work (Google Calendar, Gmail, Dropbox) happens inside
**GitHub Actions workflows** triggered by the frontend via the GitHub API. Results are
committed to a dedicated `results` branch and polled by the browser.

```
Browser (GitHub Pages, static)
   │  workflow_dispatch via GitHub API
   ▼
GitHub Actions  ──▶  Google Calendar / Gmail / Dropbox
   │  writes results/{id}.json to the "results" branch
   ▼
Browser polls and shows the outcome
```

Because the frontend has no server, it needs a credential to call the GitHub API. Users
paste a fine-grained **GitHub Personal Access Token** (scoped to this repo only, with
Actions and Contents read/write) into the app at the start of each session. It's stored
in `sessionStorage` only — never in the build, never sent anywhere except `api.github.com`.
See [Security model](#security-model) for more detail.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (static export), React, Tailwind CSS |
| Hosting | GitHub Pages |
| Backend | GitHub Actions (four workflow files) |
| Calendar | Google Calendar API (OAuth 2.0) |
| Email | Gmail API (`gmail.compose` scope) |
| Files | Dropbox API (scoped, offline refresh token) |
| Tests | Vitest (business logic only, no network) |

---

## Release workflow

Each release goes through these states in the app:

- **Draft** — artist name is saved but the release isn't fully filled in yet
- **Ready** — all required fields complete (artist, title, catalogue number, a Friday release date, at least one track)
- **Scheduled** — calendar events have been successfully created

Releases can be edited, deleted, or moved to a new date at any time. Moving a date
reschedules all calendar events without creating duplicates.

---

## Security model

- The GitHub PAT is the only credential the browser ever holds. It is scoped to one repo
  and can only trigger workflows and read the `results` branch — it cannot touch Google,
  Gmail, or Dropbox directly.
- All real API keys (Google, Gmail, Dropbox) live exclusively in **GitHub Repository Secrets**,
  visible only to GitHub Actions runners, never to the browser.
- An `APP_PASSWORD` provides a light deterrent against casual access to the UI. It is not
  real authentication — the PAT requirement is the actual gate.

---

## Forking & adapting

The tool is built on generic primitives and is reasonably straightforward to adapt:

**`config/labels.config.ts`** is the single file that defines everything
label-specific:
- Label names, short codes, and starting catalogue numbers
- The full task schedule (which tasks, how many days before release, who owns each)
- Dropbox folder/file structure
- Upcoming releases shown as shortcuts in the UI
- Timezone (defaults to `Australia/Melbourne`)

Everything else — the scheduling logic, calendar integration, email generation,
Dropbox checking — reads from this config and requires no changes to adapt to a
different label or team.

To fork:
1. Fork the repo
2. Edit `config/labels.config.ts` with your labels, task rules, and owners
3. Follow the [Setup](#setup) instructions below with your own API credentials
4. Deploy to GitHub Pages (free for public repos) or Vercel (free tier)

If you add new task types, change the royalty model, or extend the integrations,
contributions are welcome via pull request.

---

## Setup

> Full setup takes about 30 minutes the first time — most of it waiting for OAuth flows.

### 1. Repository settings

- **Settings → Pages** → Source: `GitHub Actions`
- **Settings → Actions → General → Workflow permissions** → `Read and write permissions`

### 2. Google OAuth (Calendar + Gmail)

One OAuth client covers both APIs.

1. [Google Cloud Console](https://console.cloud.google.com) → new project → enable
   **Google Calendar API** and **Gmail API**
2. **Credentials → OAuth 2.0 Client ID** (type: Web application)
   Add `https://developers.google.com/oauthplayground` as an authorized redirect URI
3. Go to [OAuth 2.0 Playground](https://developers.google.com/oauthplayground) → gear icon
   → use your own client ID/secret → authorize these two scopes as the Google account
   that owns the shared calendar:
   ```
   https://www.googleapis.com/auth/calendar.events
   https://www.googleapis.com/auth/gmail.compose
   ```
4. Exchange the authorization code → copy the **refresh token**

### 3. Dropbox

1. [Dropbox App Console](https://www.dropbox.com/developers/apps) → Create app (scoped, Full Dropbox)
   Permissions: `files.metadata.read`, `files.content.read`, `sharing.write`, `sharing.read`
2. Get an offline refresh token:
   ```bash
   # Step 1 — open in browser, authorize, copy the code from the redirect URL
   open "https://www.dropbox.com/oauth2/authorize?client_id=YOUR_APP_KEY&token_access_type=offline&response_type=code"

   # Step 2 — exchange for tokens
   curl -X POST https://api.dropbox.com/oauth2/token \
     -d code=PASTE_CODE \
     -d grant_type=authorization_code \
     -d client_id=YOUR_APP_KEY \
     -d client_secret=YOUR_APP_SECRET
   ```
   Copy the `refresh_token` from the response.

### 4. GitHub Secrets

**Settings → Secrets and variables → Actions** — add each of the following:

| Secret | Description |
|---|---|
| `GOOGLE_CLIENT_ID` | OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret |
| `GOOGLE_REFRESH_TOKEN` | Refresh token from the OAuth Playground |
| `GOOGLE_CALENDAR_ID` | Shared calendar ID (usually the owner's email address) |
| `GAVIN_EMAIL` | Calendar attendee — leave blank to omit |
| `MATTY_EMAIL` | Calendar attendee — leave blank to omit |
| `JAMES_EMAIL` | Calendar attendee — leave blank to omit |
| `GMAIL_DRAFT_RECIPIENT` | Who receives the generated release email |
| `DROPBOX_CLIENT_ID` | Dropbox app key |
| `DROPBOX_CLIENT_SECRET` | Dropbox app secret |
| `DROPBOX_REFRESH_TOKEN` | Dropbox refresh token |
| `DROPBOX_BASE_PATH` | Path containing all release folders, e.g. `/Meanwhile/Releases` |
| `APP_PASSWORD` | Password shown at the app's login screen |

### 5. Deploy

Push to `main`. The deploy workflow runs automatically and publishes to GitHub Pages.
Your app will be live at `https://<owner>.github.io/<repo>/`.

### 6. Create a GitHub PAT

Each person using the app needs their own fine-grained PAT to trigger workflows:

1. GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens**
2. Scope to this repository only
3. Repository permissions: **Actions** (read/write) + **Contents** (read/write)
4. Generate and save it — you'll paste it into the app on first use each session

---

## Local development

```bash
npm install
npm run dev       # http://localhost:3000 — full UI, workflow actions need a real PAT + deployed repo
npm test          # full unit test suite, no network calls or secrets needed
npx tsc --noEmit  # type-check everything
npm run build     # static export to ./out
```

To test a workflow script locally without real credentials:

```bash
DRY_RUN=true REQUEST_ID=test \
  PAYLOAD_JSON='{"release":{...},"mode":"create-missing"}' \
  npm run script:create-release
```

Dry run mode logs exactly what would happen without calling any external API.

---

## Project structure

```
config/labels.config.ts     All label-specific config — start here to adapt the tool
src/lib/                    Pure business logic (scheduling, IDs, email, Dropbox matching)
src/components/             React UI components
src/pages/                  Next.js pages
scripts/                    GitHub Actions entry points (one per workflow)
tests/                      Vitest unit tests for all business logic
.github/workflows/          deploy.yml + four privileged-action workflows
```

---

## License

MIT. Built by and for [Meanwhile Recordings](https://www.meanwhilerecordings.com).
Free to fork, adapt, and extend.
