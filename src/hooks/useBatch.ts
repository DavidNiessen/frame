import { useEffect, useRef, useState } from 'react';
import { batchSettings, runBatch, type BatchJob, type BatchMode } from '../core/batch';
import type { Editor } from './useEditor';
export function useBatch(editor: Editor) {
  const [jobs, setJobs] = useState<BatchJob[]>([]);
  const cancelled = useRef(false); const jobsRef = useRef(jobs); jobsRef.current = jobs;
  const clear = () => { for (const job of jobsRef.current) if (job.result?.url) URL.revokeObjectURL(job.result.url); setJobs([]); };
  useEffect(() => () => { for (const job of jobsRef.current) if (job.result?.url) URL.revokeObjectURL(job.result.url); }, []);
  async function start(ids: string[], mode: BatchMode) {
    if (!editor.asset || !editor.edit || editor.busy || !ids.length) return;
    clear(); cancelled.current = false;
    const queue: BatchJob[] = editor.assets.filter(asset => ids.includes(asset.id)).map(asset => ({ id: crypto.randomUUID(), asset,
      edit: batchSettings(asset, editor.settingsFor(asset.id), editor.asset!, editor.edit!, mode), status: 'waiting', progress: 0 }));
    setJobs(queue);
    try {
      await editor.runExclusive('batch', async engine => {
        const token = await engine.beginBatch();
        if (!token) { cancelled.current = true; }
        let retainedBytes = 0;
        try {
          await runBatch(queue, async (job, progress) => {
            const result = await engine.export(job.asset, job.edit, progress, token!);
            if (result?.url && retainedBytes + result.size > 500 * 1024 * 1024) {
              URL.revokeObjectURL(result.url); throw new Error('Batch downloads reached 500 MB. Save and clear them, then export the remaining files.');
            }
            retainedBytes += result?.size ?? 0; return result;
          }, () => cancelled.current, job => setJobs(current => current.map(item => item.id === job.id ? job : item)));
        } finally { if (token) await engine.endBatch(token); }
      });
      editor.setNotice(cancelled.current ? 'Batch cancelled. Completed exports are still available.' : 'Batch finished. Review the results for each file.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setJobs(current => current.map(job => job.status === 'waiting' || job.status === 'running' ? { ...job, status: 'failed', error: message } : job));
      editor.setNotice(message);
    }
  }
  return { jobs, start, clear, cancel: () => { cancelled.current = true; editor.cancel(); } };
}
export type Batch = ReturnType<typeof useBatch>;
