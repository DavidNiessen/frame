import type { WaveformPoint } from '../core/waveform';
export function Waveform({ points, duration }: { points: WaveformPoint[]; duration: number }) {
  const path = points.map((point, index) => {
    const x = point.time / duration * 1000;
    const width = Math.max(0.5, ((points[index + 1]?.time ?? duration) - point.time) / duration * 1000);
    const height = Math.max(0.8, point.peak * 46);
    return `M${x},${50 - height}h${width}v${height * 2}h-${width}Z`;
  }).join('');
  return <svg className="audio-waveform" viewBox="0 0 1000 100" preserveAspectRatio="none" role="img" aria-label="Audio waveform"><path d={path} /></svg>;
}
