import type { Box } from './frame-object';
export interface CanvasGuideSettings {
  grid: 'none' | 'center' | 'thirds' | 'safe';
  snapping: boolean;
}
export const defaultCanvasGuides = (): CanvasGuideSettings => ({ grid: 'none', snapping: true });
export function snapFrameMovement(
  object: Box,
  frame: Box,
  dx: number,
  dy: number,
  others: Box[],
  threshold = 7,
) {
  const axis = (
    start: number,
    size: number,
    delta: number,
    origin: number,
    length: number,
    targets: number[],
  ) => {
    const anchors = [start + delta, start + delta + size / 2, start + delta + size],
      lines = [origin, origin + length / 2, origin + length, ...targets];
    let adjustment = threshold + 1,
      line: number | undefined;
    for (const anchor of anchors)
      for (const target of lines) {
        const distance = target - anchor;
        if (Math.abs(distance) < Math.abs(adjustment)) {
          adjustment = distance;
          line = target;
        }
      }
    return Math.abs(adjustment) <= threshold ? { delta: delta + adjustment, line } : { delta };
  };
  const x = axis(
      object.left,
      object.width,
      dx,
      frame.left,
      frame.width,
      others.flatMap((o) => [o.left, o.left + o.width / 2, o.left + o.width]),
    ),
    y = axis(
      object.top,
      object.height,
      dy,
      frame.top,
      frame.height,
      others.flatMap((o) => [o.top, o.top + o.height / 2, o.top + o.height]),
    );
  return {
    dx: x.delta,
    dy: y.delta,
    x: x.line === undefined ? undefined : (x.line - frame.left) / frame.width,
    y: y.line === undefined ? undefined : (y.line - frame.top) / frame.height,
  };
}
