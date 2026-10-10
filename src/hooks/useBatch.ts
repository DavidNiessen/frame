import { useLoadingActivity } from './useLoadingActivity';
import { notifyCompletion } from '../core/completion-notifications';
import { useEffect, useRef, useState } from 'react';
import { batchSettings, runBatch, type BatchJob, type BatchMode } from '../core/batch';
import { conversionSettings } from '../core/conversion';
import type { OutputSettings } from '../core/presets';
import type { BatchOptions } from '../core/types';
import type { Editor } from './useEditor';
export function useBatch(editor: Editor) {
  const [jobs, setJobs] = useState<BatchJob[]>([]);
  const namingOrder = useRef<string[]>([]);
  const [running, setRunning] = useState(false); const runningRef = useRef(false);
  const [conversionMode, setConversionMode] = useState(false), activeIds = useRef(new Set<string>());
  const cancelled = useRef(false); const jobsRef = useRef(jobs); jobsRef.current = jobs;
  const queue = jobs.filter(job => activeIds.current.has(job.id)), current = queue.find(job => job.status === 'running');
  const ratio = queue.length ? queue.reduce((sum, job) => sum + (job.status === 'running' ? job.progress : job.status === 'waiting' ? 0 : 1), 0) / queue.length : undefined;
  function cancel() { if (runningRef.current) { cancelled.current = true; editor.cancel(); } }
  useLoadingActivity(running, conversionMode ? 'Converting files…' : 'Exporting batch…', { priority: 30, ratio,
    message: current ? `${queue.findIndex(job => job.id === current.id) + 1} / ${queue.length} · ${current.asset.name}` : 'Preparing files…', cancel, cancelLabel: conversionMode ? 'Cancel conversion' : 'Cancel batch' });
  const clear = () => { if (runningRef.current) return; namingOrder.current = []; for (const job of jobsRef.current) if (job.result?.url) URL.revokeObjectURL(job.result.url); setJobs([]); };
  useEffect(() => () => { for (const job of jobsRef.current) if (job.result?.url) URL.revokeObjectURL(job.result.url); }, []);
  async function execute(queue: BatchJob[], options?: BatchOptions, keepResults = false) {
    if (runningRef.current || editor.busy || !queue.length) return;
    activeIds.current = new Set(queue.map(job => job.id)); setConversionMode(!!options?.conversion);
    runningRef.current = true; setRunning(true); cancelled.current = false;
    const retained = keepResults ? jobsRef.current.filter(job => !queue.some(next => next.asset.id === job.asset.id)) : [];
    for (const job of jobsRef.current) if (!retained.includes(job) && job.result?.url) URL.revokeObjectURL(job.result.url);
    setJobs([...retained, ...queue]);
    const outcomes = new Map(queue.map(job => [job.id, job]));
    try {
      await editor.runExclusive('batch', async engine => {
        const token = await engine.beginBatch(options);
        if (!token) { cancelled.current = true; }
        let retainedBytes = retained.reduce((sum, job) => sum + (job.result?.url ? job.result.size : 0), 0);
        try {
          await runBatch(queue, async (job, progress) => {
            const result = await engine.export(job.asset, job.edit, progress, token!);
            if (result?.url && retainedBytes + result.size > 500 * 1024 * 1024) {
              URL.revokeObjectURL(result.url); throw new Error('Batch downloads reached 500 MB. Save and clear them, then export the remaining files.');
            }
            retainedBytes += result?.url ? result.size : 0; return result;
          }, () => cancelled.current, job => { outcomes.set(job.id, job); setJobs(current => current.map(item => item.id === job.id ? job : item)); });
        } finally { if (token) await engine.endBatch(token); }
      });
      const completed = [...outcomes.values()].filter(job => job.status === 'done').length, failed = [...outcomes.values()].filter(job => job.status === 'failed').length;
      if (completed && !cancelled.current) await notifyCompletion({ kind: options?.conversion ? 'conversion' : 'batch', total: queue.length, completed, failed });
      editor.setNotice(cancelled.current ? 'Batch cancelled. Completed exports are still available.' : 'Batch finished. Review the results for each file.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setJobs(current => current.map(job => queue.some(item => item.id === job.id) && (job.status === 'waiting' || job.status === 'running') ? { ...job, status: 'failed', error: message } : job));
      editor.setNotice(message);
    } finally { runningRef.current = false; setRunning(false); }
  }
  async function start(ids: string[], mode: BatchMode) {
    if (!editor.asset || !editor.edit) return;
    const queue: BatchJob[] = editor.assets.filter(asset => ids.includes(asset.id)).map(asset => ({ id: crypto.randomUUID(), asset,
      edit: batchSettings(asset, editor.settingsFor(asset.id), editor.asset!, editor.edit!, mode), status: 'waiting', progress: 0 }));
    await execute(queue);
  }
  const orderFor = (ids: string[]) => [...new Set([...namingOrder.current, ...editor.assets.filter(asset => ids.includes(asset.id)).map(asset => asset.id)])];
  async function convert(ids: string[], output: OutputSettings, keepFolders: boolean, namingTemplate = '{name}', customArtwork: string | null = null) {
    if (runningRef.current || editor.busy) return;
    const queue: BatchJob[] = editor.assets.filter(asset => ids.includes(asset.id)).map(asset => ({ id: crypto.randomUUID(), asset,
      edit: { ...conversionSettings(asset, output), customArtwork }, status: 'waiting', progress: 0 }));
    namingOrder.current = orderFor(ids);
    await execute(queue, { conversion: true, keepFolders, namingTemplate, order: namingOrder.current }, true);
  }
  async function openFolder() { try { await window.frameDesktop?.openBatchFolder(); } catch (error) { editor.setNotice(error instanceof Error ? error.message : String(error)); } }
  return { jobs, start, convert, orderFor, running, clear, openFolder, cancel };
}
export type Batch = ReturnType<typeof useBatch>;
