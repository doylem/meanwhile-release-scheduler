/**
 * Dropbox access tokens issued for "offline" apps expire (~4 hours). We
 * store a long-lived refresh token in GitHub Secrets and exchange it for a
 * fresh access token at the start of every workflow run, rather than
 * storing a long-lived access token that would eventually stop working.
 */
export async function getDropboxAccessToken(): Promise<string> {
  const clientId = process.env.DROPBOX_CLIENT_ID;
  const clientSecret = process.env.DROPBOX_CLIENT_SECRET;
  const refreshToken = process.env.DROPBOX_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Missing DROPBOX_CLIENT_ID, DROPBOX_CLIENT_SECRET or DROPBOX_REFRESH_TOKEN. See README.md for how to obtain a Dropbox refresh token.'
    );
  }

  const res = await fetch('https://api.dropbox.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to refresh Dropbox access token (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}
