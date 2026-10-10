import { useEffect, useState } from 'react';
/** Edits change duration, not the zoom. Fit is an explicit user action. */
export function useTimelineScale(assetId: string, sourceDuration: number, outputDuration: number) {
  const [axis, setAxis] = useState({ assetId, duration: sourceDuration });
  const extent = axis.assetId === assetId ? axis.duration : sourceDuration;
  const total = Math.max(extent, outputDuration);
  useEffect(() => { setAxis(previous => previous.assetId !== assetId || previous.duration !== total ? { assetId, duration: total } : previous); }, [assetId, total]);
  return { total, fit: () => setAxis({ assetId, duration: outputDuration }) };
}
