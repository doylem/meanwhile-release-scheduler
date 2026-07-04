<div align="center">

# 🎵 Release Scheduler

**A tool for independent record labels to coordinate music releases — without spreadsheets.**

Schedule tasks · Create calendar events · Check assets · Draft emails · Track everything in one place.

[![Tests](https://github.com/doylem/meanwhile-release-scheduler/actions/workflows/test.yml/badge.svg)](https://github.com/doylem/meanwhile-release-scheduler/actions/workflows/test.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-22c55e?style=flat-square)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![Hosted on GitHub Pages](https://img.shields.io/badge/hosted_on-GitHub_Pages-1d4ed8?style=flat-square&logo=github)](https://pages.github.com)
[![No server required](https://img.shields.io/badge/backend-GitHub_Actions-6d28d9?style=flat-square&logo=github-actions)](https://github.com/features/actions)

---

Built by **[Meanwhile Recordings](https://www.meanwhilerecordings.com)** · Free to fork for any label

</div>

---

## What it does

Enter a release once and the app handles the rest of the coordination:

| | |
|---|---|
| 📅 **Task schedule** | Deadlines calculated back from release date, each assigned to a team member |
| 🗓 **Google Calendar** | One event per task, created in your shared calendar with one click |
| 📦 **Dropbox check** | Scans your release folder for masters, artwork, videos, and surfaces shareable links |
| 📧 **Email draft** | Pre-filled Gmail draft to your distributor, ready to review and send |

Every action is deliberate — nothing triggers automatically. This is a coordinator, not a bot.

---

## How it works

There's no server. The frontend is a static site on GitHub Pages; all privileged work (Google Calendar, Gmail, Dropbox) runs inside **GitHub Actions workflows** triggered by the browser.

```
Browser (GitHub Pages)
   │  workflow_dispatch via GitHub API
   ▼
GitHub Actions  ──▶  Google Calendar  /  Gmail  /  Dropbox
   │  commits results to the "results" branch
   ▼
Browser polls and displays the outcome
```

API keys never touch the browser. The only credential the browser holds is a fine-grained **GitHub PAT** scoped to this one repo. See [Security model](#security-model).

---

## Use this for your label

This tool is built to be forked. If you run a record label with a similar release workflow — deadlines, a shared calendar, Dropbox, a distributor email — you can be up and running in about 30 minutes.

### Quick start

1. **Fork** this repo to your GitHub account
2. Add your [API credentials as GitHub Secrets](#github-secrets) (Google, Gmail, Dropbox)
3. **Deploy** — push to `main` and GitHub Pages publishes automatically
4. Open the app, connect with a PAT, and **configure everything via the Admin panel** — no code editing required

### Configuring via the Admin panel

Once deployed and connected, go to **Admin** in the app header. From there you can set:

- **Labels** — your label name(s), short codes, and starting catalogue numbers
- **Task schedule** — which deadlines to create, how many days before release, who owns each, and what time they appear in the calendar
- **Team** — the names that appear on task ownership
- **Features** — toggle Dropbox checking, Calendar events, and Email drafts on or off independently. Set a default email recipient.

Settings are saved to the `results` branch and take effect immediately for everyone using the app — no redeploy needed.

### Customising further

For deeper changes (new integrations, different royalty logic, custom email templates), the relevant files are:

| File | What it controls |
|---|---|
| `src/lib/email.ts` | Email body template |
| `src/lib/calendarEvents.ts` | Calendar event title and description format |
| `src/lib/scheduling.ts` | Task date calculation logic |
| `config/labels.config.ts` | Default fallback values (used before settings are saved) |

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (static export), React, Tailwind CSS |
| Hosting | GitHub Pages (free for public repos) |
| Backend | GitHub Actions |
| Calendar | Google Calendar API |
| Email | Gmail API |
| Files | Dropbox API |
| Tests | Vitest |

---

## Setup

> Takes about 30 minutes the first time — mostly waiting for OAuth flows.

### 1. Repository settings

- **Settings → Pages** → Source: `GitHub Actions`
- **Settings → Actions → General → Workflow permissions** → `Read and write permissions`

### 2. Google OAuth (Calendar + Gmail)

One OAuth client covers both APIs.

1. [Google Cloud Console](https://console.cloud.google.com) → new project → enable **Google Calendar API** and **Gmail API**
2. **Credentials → OAuth 2.0 Client ID** (type: Web application) — add `https://developers.google.com/oauthplayground` as an authorized redirect URI
3. Go to [OAuth 2.0 Playground](https://developers.google.com/oauthplayground) → gear icon → use your own client ID/secret → authorize as the Google account that owns the shared calendar:
   ```
   https://www.googleapis.com/auth/calendar.events
   https://www.googleapis.com/auth/gmail.compose
   ```
4. Exchange the authorization code and copy the **refresh token**

### 3. Dropbox

1. [Dropbox App Console](https://www.dropbox.com/developers/apps) → Create app (scoped access, Full Dropbox)
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

**Settings → Secrets and variables → Actions** → add:

| Secret | Description |
|---|---|
| `GOOGLE_CLIENT_ID` | OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret |
| `GOOGLE_REFRESH_TOKEN` | Refresh token from the OAuth Playground |
| `GOOGLE_CALENDAR_ID` | Shared calendar ID (usually the calendar owner's email) |
| `GMAIL_DRAFT_RECIPIENT` | Who receives the generated release email |
| `DROPBOX_CLIENT_ID` | Dropbox app key |
| `DROPBOX_CLIENT_SECRET` | Dropbox app secret |
| `DROPBOX_REFRESH_TOKEN` | Dropbox offline refresh token |
| `DROPBOX_BASE_PATH` | Path containing your release folders, e.g. `/Releases` |
| `APP_PASSWORD` | Optional: shown at the app's login screen as a light access gate |

Calendar attendee emails (optional — leave blank to omit):

| Secret | Description |
|---|---|
| `GAVIN_EMAIL` | Added as calendar attendee to relevant tasks |
| `MATTY_EMAIL` | Added as calendar attendee to relevant tasks |
| `JAMES_EMAIL` | Added as calendar attendee to relevant tasks |

> **Note:** attendee secrets are named after the Meanwhile team. To customise which owners get calendar invites, edit `.github/workflows/create-release.yml` and `move-release.yml`.

### 5. Deploy

Push to `main`. The deploy workflow publishes to GitHub Pages automatically.
Your app will be live at `https://<owner>.github.io/<repo>/`.

### 6. Create a GitHub PAT

Each person using the app needs a fine-grained PAT:

1. GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens**
2. Scope it to this repository only
3. Repository permissions: **Actions** (read/write) + **Contents** (read/write)
4. Paste it into the app on first use — tick "Remember me" to store it across sessions

---

## Security model

- **The browser never sees your API keys.** Google, Gmail, and Dropbox credentials live only in GitHub Secrets, accessible only to Actions runners.
- **The PAT is the only browser-held credential.** It's scoped to one repo and can only trigger workflows and read/write the `results` branch.
- The PAT is stored in `sessionStorage` (forgotten on tab close) unless the user ticks "Remember me" (localStorage).
- `APP_PASSWORD` is a lightweight access deterrent, not real authentication. The PAT is the actual gate.

---

## Local development

```bash
npm install
npm run dev       # http://localhost:3000
npm test          # unit test suite — no network, no secrets
npx tsc --noEmit  # full type check
npm run build     # static export → ./out
```

To test a workflow script locally without real credentials:

```bash
DRY_RUN=true REQUEST_ID=test \
  PAYLOAD_JSON='{"release":{...},"mode":"create-missing"}' \
  npm run script:create-release
```

Dry run mode logs everything that would happen without calling any external API.

---

## Project structure

```
config/labels.config.ts     Default fallback config — label names, task rules, timezone
src/lib/settings.ts         AppSettings type + default values
src/lib/useSettings.tsx     Settings context — loads from results branch, falls back to defaults
src/lib/                    Business logic — scheduling, IDs, email, Dropbox matching, calendar
src/components/             React UI components
src/pages/                  Next.js pages (index + admin)
scripts/                    GitHub Actions entry points (one per workflow)
tests/                      Vitest unit tests
.github/workflows/          deploy.yml + four action workflows
```

---

## Contributing

Pull requests are welcome. If you've forked this for your label and built something useful — new integrations, a different distributor email format, support for more calendar providers — feel free to contribute it back.

---

## License

MIT. Built by [Meanwhile Recordings](https://www.meanwhilerecordings.com). Free to fork, adapt, and use.
