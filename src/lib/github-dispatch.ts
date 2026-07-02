/**
 * The frontend is a fully static export on GitHub Pages — it has no
 * server of its own. Privileged operations (Google Calendar, Gmail,
 * Dropbox) run inside GitHub Actions instead. This module is the bridge:
 *
 *  1. The browser calls the GitHub REST API directly to trigger a
 *     workflow_dispatch event, using a fine-grained Personal Access Token
 *     the user pastes into the app (stored only in sessionStorage on their
 *     own machine — see SecretGate component and README "Security model").
 *  2. The workflow does the real work and commits a JSON result file to a
 *     dedicated `results` branch, named after a requestId the browser
 *     generated up front.
 *  3. The browser polls that file (via the GitHub Contents API, same
 *     token) until it appears, then shows the outcome.
 *
 * IMPORTANT: this PAT is entered at runtime by the person using the app.
 * It is never baked into the static build, never committed, and never
 * sent anywhere except api.github.com. Scope it as narrowly as possible
 * (Actions: read/write, Contents: read/write, this repo only) — see README.
 */

export type WorkflowFile =
  | 'create-release.yml'
  | 'move-release.yml'
  | 'check-dropbox-assets.yml'
  | 'generate-gmail-draft.yml';

export interface GithubDispatchConfig {
  token: string;
  owner: string;
  repo: string;
  /** Branch the workflow file lives on — almost always "main". */
  ref?: string;
}

function ghHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
}

export function generateRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Triggers a workflow_dispatch run. The workflow must declare a `payload`
 * (JSON string), `request_id`, and `dry_run` input — see .github/workflows.
 */
export async function dispatchWorkflow(
  config: GithubDispatchConfig,
  workflowFile: WorkflowFile,
  payload: unknown,
  options?: { dryRun?: boolean }
): Promise<{ requestId: string }> {
  const requestId = generateRequestId();
  const ref = config.ref ?? 'main';

  const res = await fetch(
    `https://api.github.com/repos/${config.owner}/${config.repo}/actions/workflows/${workflowFile}/dispatches`,
    {
      method: 'POST',
      headers: ghHeaders(config.token),
      body: JSON.stringify({
        ref,
        inputs: {
          payload: JSON.stringify(payload),
          request_id: requestId,
          dry_run: String(Boolean(options?.dryRun)),
        },
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to trigger workflow "${workflowFile}" (${res.status}): ${text}`);
  }

  return { requestId };
}

/**
 * Polls the `results` branch for results/{requestId}.json. Returns the
 * parsed JSON once found, or throws after `timeoutMs` of no result —
 * which usually means the workflow run failed before it could write one;
 * the caller should point the user at the repo's Actions tab.
 */
export async function pollForResult<T = unknown>(
  config: GithubDispatchConfig,
  requestId: string,
  opts: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 2 * 60 * 1000;
  const intervalMs = opts.intervalMs ?? 4000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const res = await fetch(
      `https://api.github.com/repos/${config.owner}/${config.repo}/contents/results/${requestId}.json?ref=results`,
      { headers: ghHeaders(config.token) }
    );

    if (res.ok) {
      const data = await res.json();
      const decoded = atob(data.content.replace(/\n/g, ''));
      return JSON.parse(decoded) as T;
    }

    if (res.status !== 404) {
      const text = await res.text();
      throw new Error(`Error polling for result (${res.status}): ${text}`);
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error(
    `Timed out waiting for a result after ${Math.round(timeoutMs / 1000)}s. Check the "Actions" tab in GitHub for run logs — request ID: ${requestId}`
  );
}
