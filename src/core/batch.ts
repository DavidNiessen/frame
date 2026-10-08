import { validateEdit } from './export-plan';
import { outputSettings } from './presets';
import type { EditSettings, ExportProgress, ExportResult, MediaAsset } from './types';
export type BatchMode = 'individual' | 'output' | 'edits';
export interface BatchJob {
  id: string; asset: MediaAsset; edit: EditSettings;
  status: 'waiting' | 'running' | 'done' | 'failed' | 'cancelled';
  progress: number; error?: string; result?: ExportResult;
}
export function batchSettings(asset: MediaAsset, own: EditSettings, source: MediaAsset, template: EditSettings, mode: BatchMode): EditSettings {
  if (mode === 'individual') return structuredClone(own);
  if (mode === 'output') return { ...structuredClone(own), ...outputSettings(template) };
  const edit = structuredClone(template);
  edit.end = template.end >= source.duration - 0.05 ? asset.duration : Math.min(template.end, asset.duration);
  edit.splits = edit.splits.filter(time => time < asset.duration);
  edit.cuts = edit.cuts.filter(range => range.start < asset.duration).map(range => ({ ...range, end: Math.min(range.end, asset.duration) }));
  return edit;
}
export async function runBatch(jobs: BatchJob[], encode: (job: BatchJob, progress: (p: ExportProgress) => void) => Promise<ExportResult | null>, cancelled: () => boolean, changed: (job: BatchJob) => void) {
  for (const job of jobs) {
    if (cancelled()) { changed({ ...job, status: 'cancelled' }); continue; }
    try {
      validateEdit(job.asset, job.edit);
      changed({ ...job, status: 'running' });
      const result = await encode(job, p => changed({ ...job, status: 'running', progress: p.ratio }));
      changed({ ...job, status: result ? 'done' : 'cancelled', progress: result ? 1 : 0, result: result ?? undefined });
    } catch (error) {
      changed({ ...job, status: cancelled() ? 'cancelled' : 'failed', error: cancelled() ? undefined : error instanceof Error ? error.message : String(error) });
    }
  }
}
