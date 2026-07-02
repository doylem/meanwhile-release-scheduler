import { useState } from 'react';
import { dispatchWorkflow, pollForResult, type WorkflowFile } from './github-dispatch';
import { useGithubConnection } from './githubConnection';

export type ActionStatus = 'idle' | 'dispatching' | 'waiting' | 'done' | 'error';

export function useWorkflowAction<T = unknown>(workflowFile: WorkflowFile) {
  const { connection } = useGithubConnection();
  const [status, setStatus] = useState<ActionStatus>('idle');
  const [result, setResult] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);

  async function run(payload: unknown, options?: { dryRun?: boolean }) {
    if (!connection) {
      setError('Connect GitHub before running this action.');
      setStatus('error');
      return;
    }
    setStatus('dispatching');
    setError(null);
    setResult(null);
    try {
      const { requestId: id } = await dispatchWorkflow(connection, workflowFile, payload, options);
      setRequestId(id);
      setStatus('waiting');
      const res = await pollForResult<T>(connection, id);
      setResult(res);
      setStatus('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }

  return { run, status, result, error, requestId };
}
