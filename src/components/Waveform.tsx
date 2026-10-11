import { useMemo } from 'react';
import { waveformPath, type WaveformPoint } from '../core/waveform';
import type { TimeRange } from '../core/types';
export function Waveform({
  points,
  duration,
  range,
}: {
  points: WaveformPoint[];
  duration: number;
  range: TimeRange;
}) {
  const path = useMemo(
    () => waveformPath(points, duration, { start: range.start, end: range.end }),
    [points, duration, range.start, range.end],
  );
  return (
    <svg
      className="audio-waveform"
      viewBox="0 0 1000 100"
      preserveAspectRatio="none"
      role="img"
      aria-label="Audio waveform"
      data-start={range.start}
      data-end={range.end}
    >
      <path d={path} />
    </svg>
  );
}
