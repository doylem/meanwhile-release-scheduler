/**
 * Only NON-secret values belong here. Anything prefixed NEXT_PUBLIC_ is
 * baked into the static JS bundle and visible to anyone who opens the
 * page — repo owner/name are not secrets, so that's fine. Never add an
 * API key, PAT, or refresh token to this file or to any NEXT_PUBLIC_ var.
 */
export const GITHUB_OWNER = process.env.NEXT_PUBLIC_GITHUB_OWNER || '';
export const GITHUB_REPO = process.env.NEXT_PUBLIC_GITHUB_REPO || '';

/**
 * Optional light deterrent for the password gate (see components/PasswordGate.tsx).
 * This is NOT real security — it's baked into the public bundle like
 * everything else on a static site, so a determined visitor can read it.
 * The actual access control is the GitHub PAT required for every
 * privileged action (see components/GithubConnectGate.tsx and README
 * "Security model"). Leave NEXT_PUBLIC_APP_PASSWORD unset to disable the gate.
 */
export const APP_PASSWORD = process.env.NEXT_PUBLIC_APP_PASSWORD || '';
