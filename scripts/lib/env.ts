/**
 * Reads and validates required environment variables (populated from
 * GitHub Repository Secrets in Actions, or a local .env.local for dev).
 * Throws a clear, actionable error naming exactly which var is missing —
 * scripts run unattended in CI, so silent undefined values are dangerous.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable "${name}". Set it as a GitHub Repository Secret (see README.md) ` +
        `or in .env.local for local development.`
    );
  }
  return value;
}

export function optionalEnv(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

export function isDryRun(): boolean {
  return process.env.DRY_RUN === 'true' || process.env.DRY_RUN === '1';
}

export function googleAuthFromEnv() {
  return {
    clientId: requireEnv('GOOGLE_CLIENT_ID'),
    clientSecret: requireEnv('GOOGLE_CLIENT_SECRET'),
    refreshToken: requireEnv('GOOGLE_REFRESH_TOKEN'),
  };
}

export function calendarConfigFromEnv() {
  return {
    ...googleAuthFromEnv(),
    calendarId: requireEnv('GOOGLE_CALENDAR_ID'),
  };
}
