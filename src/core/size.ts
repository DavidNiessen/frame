import { getFormat } from './formats';
import { frameDimensions } from './geometry';
import { editedDuration } from './timeline';
import type { EditSettings, MediaAsset } from './types';
export const supportsSizeTarget = (format: string) => !['wav', 'flac', 'gif'].includes(format);
export function validateSizeTarget(value: number | null): void {
  if (value !== null && (!Number.isFinite(value) || value < .1 || value > 100000)) throw new Error('Target size must be 0.1–100,000 MB.');
}
export function resolveSizeTarget(asset: MediaAsset, edit: EditSettings): EditSettings {
  validateSizeTarget(edit.targetSizeMb); if (edit.targetSizeMb === null || !supportsSizeTarget(edit.format)) return edit;
  const budget = edit.targetSizeMb * 1_000_000 * 8 * .95 / editedDuration(edit) / 1000;
  if (getFormat(edit.format).kind === 'audio') {
    if (budget < 32) throw new Error('This target is too small. Increase the size to allow at least 32 kbps audio.');
    return { ...edit, audioBitrate: Math.min(320, Math.floor(budget)) };
  }
  const video = Math.floor(budget - (asset.hasAudio ? edit.audioBitrate : 0));
  if (video < 100) throw new Error('This target is too small for the duration and audio bitrate. Increase it or lower the audio bitrate.');
  return { ...edit, videoBitrate: Math.min(100000, video) };
}
export interface SizeEstimate { low: number; high: number; label: string; bitrate?: string }
export function estimateSize(asset: MediaAsset, recipe: EditSettings): SizeEstimate | null {
  const edit = resolveSizeTarget(asset, recipe); const duration = editedDuration(edit); if (duration <= 0 || edit.format === 'gif') return null;
  if (['wav', 'flac'].includes(edit.format)) {
    const rate = edit.speed !== 1 || edit.normalizeLoudness ? 48000 : asset.audioSampleRate ?? 48000;
    const pcm = duration * rate * (asset.audioChannels ?? 2) * 2;
    return edit.format === 'wav' ? { low: pcm, high: pcm * 1.02 + 4096, label: 'PCM estimate; artwork/metadata may add size' } : { low: pcm * .3, high: pcm * 1.02, label: 'Broad lossless estimate; depends on the audio' };
  }
  if (getFormat(edit.format).kind === 'audio') {
    const size = duration * edit.audioBitrate * 1000 / 8;
    return { low: size * .95, high: size * 1.08 + 8192, label: 'Bitrate estimate; includes approximate container overhead', bitrate: `${edit.audioBitrate} kbps audio` };
  }
  const { width, height } = frameDimensions(asset, edit); const video = edit.videoBitrate ?? width * height * 30 * ({ high: .12, balanced: .07, small: .035 }[edit.quality]) / 1000;
  const size = duration * (video + (asset.hasAudio ? edit.audioBitrate : 0)) * 1000 / 8;
  return { low: size * (edit.videoBitrate ? .8 : .15), high: size * (edit.videoBitrate ? 1.2 : 2.5) + 8192, label: edit.videoBitrate ? 'Average-bitrate estimate; actual content affects size' : 'Rough quality-mode range; bitrate varies with content', bitrate: edit.videoBitrate ? `${edit.videoBitrate} kbps video${asset.hasAudio ? ` + ${edit.audioBitrate} kbps audio` : ''}` : undefined };
}
