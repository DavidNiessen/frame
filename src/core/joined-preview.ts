import { editClips } from './clips';
import type { EditSettings, MediaAsset, TimeRange } from './types';

/** Any gaps or reordered footage use one stream, independent of visual split/group IDs. */
export function joinedPreviewRanges(edit: EditSettings): TimeRange[] | null {
  const ranges: TimeRange[] = [];
  for (const { start, end } of editClips(edit)) {
    const last = ranges.at(-1);
    if (last && Math.abs(last.end - start) < 1e-8) last.end = end;
    else ranges.push({ start, end });
  }
  return ranges.length > 1 ? ranges : null;
}
export function validatePreviewRanges(asset: MediaAsset, ranges: TimeRange[]) {
  if (!Array.isArray(ranges) || !ranges.length || ranges.length > 1000 || ranges.some(range => !range || !Number.isFinite(range.start) || !Number.isFinite(range.end) || range.start < 0 || range.end > asset.duration + .05 || range.end <= range.start)) throw new Error('Invalid continuous preview ranges.');
}
/** A previous preview can remain visible only if it contains all newly retained footage. */
export function previewCoversRanges(previous: TimeRange[], next: TimeRange[]) {
  return next.every(range => previous.some(kept => range.start >= kept.start - 1e-8 && range.end <= kept.end + 1e-8));
}
export function joinedPreviewArgs(asset: MediaAsset, ranges: TimeRange[], input: string, output: string) {
  validatePreviewRanges(asset, ranges);
  const video = asset.kind === 'video', audio = asset.hasAudio || !video;
  const graph: string[] = [];
  ranges.forEach((range, index) => {
    const trim = `start=${range.start}:end=${range.end}`;
    if (video) graph.push(`[0:V:0]trim=${trim},setpts=PTS-STARTPTS,scale=w='min(720,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1,format=yuv420p,settb=AVTB[v${index}]`);
    if (audio) graph.push(`[0:a:0]atrim=${trim},asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp[a${index}]`);
  });
  graph.push(ranges.map((_, i) => `${video ? `[v${i}]` : ''}${audio ? `[a${i}]` : ''}`).join('') + `concat=n=${ranges.length}:v=${video ? 1 : 0}:a=${audio ? 1 : 0}${video ? '[video]' : ''}${audio ? '[audio]' : ''}`);
  return ['-y', '-i', input, '-filter_complex', graph.join(';'), ...(video ? ['-map', '[video]', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'] : ['-vn']), ...(audio ? ['-map', '[audio]', '-c:a', video ? 'aac' : 'libmp3lame', '-b:a', '128k'] : ['-an']), '-threads', '2', output];
}
