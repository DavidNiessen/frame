export interface CompletionSummary { kind: 'export' | 'conversion' | 'batch' | 'merge'; total: number; completed: number; failed: number }
export interface NotificationPreference { supported: boolean; enabled: boolean }
export function parseCompletion(value: unknown): CompletionSummary {
  const summary = value as CompletionSummary;
  if (!summary || !['export', 'conversion', 'batch', 'merge'].includes(summary.kind) || ![summary.total, summary.completed, summary.failed].every(n => Number.isInteger(n) && n >= 0 && n <= 2000) || summary.total < 1 || summary.completed + summary.failed > summary.total || summary.completed < 1) throw new Error('Invalid completion notification.');
  return { kind: summary.kind, total: summary.total, completed: summary.completed, failed: summary.failed };
}
export function completionMessage(value: CompletionSummary) {
  const s = parseCompletion(value), label = s.kind === 'merge' ? 'Merge' : s.kind === 'conversion' ? 'Conversion' : s.kind === 'batch' ? 'Batch export' : 'Export';
  return { title: `Frame · ${label} ${s.completed < s.total ? 'finished' : 'complete'}`, body: `${s.completed} ${s.completed === 1 ? 'file' : 'files'} saved.${s.failed ? ` ${s.failed} ${s.failed === 1 ? 'file needs' : 'files need'} attention.` : ''}` };
}
export async function notifyCompletion(summary: CompletionSummary): Promise<void> {
  try { await window.frameDesktop?.notifyCompletion(summary); } catch { /* A notification failure must not invalidate saved exports. */ }
}
