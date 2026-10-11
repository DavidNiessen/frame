import type { BatchJob } from './batch';
import { editedDuration } from './timeline';
function cell(value: string): string {
  let text = value.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
  // User filenames and encoder errors must remain text in spreadsheet applications.
  if (/^\s*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
export function conversionReport(jobs: BatchJob[]): string {
  const headers = [
    'Source',
    'Status',
    'Format',
    'Output',
    'Source bytes',
    'Output bytes',
    'Size change (%)',
    'Duration (seconds)',
    'Error',
  ];
  const rows = jobs.map((job) => {
    const duration = editedDuration(job.edit),
      result = job.result;
    return [
      cell(job.asset.relativePath || job.asset.name),
      cell(job.status),
      cell(job.edit.format),
      cell(result?.path || result?.relativePath || result?.name || ''),
      String(job.asset.size),
      result ? String(result.size) : '',
      result && job.asset.size > 0
        ? (((result.size - job.asset.size) / job.asset.size) * 100).toFixed(1)
        : '',
      Number.isFinite(duration) ? duration.toFixed(3) : '',
      cell(job.error || ''),
    ].join(',');
  });
  return '\ufeff' + [headers.map(cell).join(','), ...rows].join('\r\n') + '\r\n';
}
