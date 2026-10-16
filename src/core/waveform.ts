import type { MediaAsset, TimeRange } from './types';
export interface WaveformPoint {
  time: number;
  peak: number;
}
/** Clip source peak windows to the visible section, including partially trimmed windows. */
export function waveformPath(points: WaveformPoint[], duration: number, range: TimeRange): string {
  const start = Math.max(0, range.start),
    end = Math.min(duration, range.end),
    length = end - start;
  if (length <= 0) return '';
  return points
    .map((point, index) => {
      const from = Math.max(start, point.time),
        to = Math.min(end, points[index + 1]?.time ?? duration);
      if (to <= from) return '';
      const x = ((from - start) / length) * 1000,
        width = ((to - from) / length) * 1000;
      const height = Math.max(0.8, point.peak * 46);
      return `M${x},${50 - height}h${width}v${height * 2}h-${width}Z`;
    })
    .join('');
}
/** Fixed-size peak windows keep output bounded and retain peaks across every channel. */
export function waveformArgs(asset: MediaAsset, input: string): string[] {
  if (!asset.hasAudio) throw new Error('This file has no audio waveform.');
  const samples = Math.max(1024, Math.ceil((asset.duration * 48000) / 1024));
  return [
    '-loglevel',
    'info',
    '-threads',
    '1',
    '-filter_threads',
    '1',
    '-i',
    input,
    '-vn',
    '-af',
    `aresample=48000,asetnsamples=n=${samples}:p=0,astats=metadata=1:reset=1:measure_perchannel=none:measure_overall=Peak_level,ametadata=mode=print:key=lavfi.astats.Overall.Peak_level`,
    '-f',
    'null',
    '-',
  ];
}
export class WaveformCollector {
  readonly points: WaveformPoint[] = [];
  private time = 0;
  push(message: string) {
    for (const line of message.split('\n')) {
      const timestamp = /pts_time:([\d.e+-]+)/.exec(line);
      if (timestamp) this.time = Number(timestamp[1]);
      const peak = /lavfi\.astats\.Overall\.Peak_level=(-?inf|[\d.e+-]+)/i.exec(line);
      if (peak && this.points.length < 2048 && Number.isFinite(this.time)) {
        const db = Number(peak[1]);
        this.points.push({
          time: this.time,
          peak: Number.isFinite(db) ? Math.min(1, 10 ** (db / 20)) : 0,
        });
      }
    }
  }
}
