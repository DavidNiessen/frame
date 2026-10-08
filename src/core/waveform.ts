import type { MediaAsset } from './types';
export interface WaveformPoint { time: number; peak: number }
/** Fixed-size peak windows keep output bounded and retain peaks across every channel. */
export function waveformArgs(asset: MediaAsset, input: string): string[] {
  if (!asset.hasAudio) throw new Error('This file has no audio waveform.');
  const samples = Math.max(1024, Math.ceil(asset.duration * 48000 / 1024));
  return ['-loglevel', 'info', '-i', input, '-vn', '-af', `aresample=48000,asetnsamples=n=${samples}:p=0,astats=metadata=1:reset=1,ametadata=mode=print:key=lavfi.astats.Overall.Peak_level`, '-f', 'null', '-'];
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
        const db = Number(peak[1]); this.points.push({ time: this.time, peak: Number.isFinite(db) ? Math.min(1, 10 ** (db / 20)) : 0 });
      }
    }
  }
}
