import { expect, it } from 'vitest';
import { resizedBox, resizeFactor } from '../src/core/frame-object';
it('keeps the opposite corner fixed for proportional resizing and clamps it to the frame', () => {
  const frame = { left: 50, top: 30, width: 640, height: 360 }, box = { left: 100, top: 80, width: 160, height: 90 };
  for (const corner of ['nw', 'ne', 'sw', 'se'] as const) {
    const factor = resizeFactor(box, frame, corner, corner.endsWith('w') ? -1000 : 1000, corner.startsWith('n') ? -1000 : 1000);
    const result = resizedBox(box, corner, factor);
    expect(result.width / result.height).toBeCloseTo(160 / 90);
    expect(result.left).toBeGreaterThanOrEqual(frame.left); expect(result.top).toBeGreaterThanOrEqual(frame.top);
    expect(result.left + result.width).toBeLessThanOrEqual(frame.left + frame.width + .001); expect(result.top + result.height).toBeLessThanOrEqual(frame.top + frame.height + .001);
    expect(corner.endsWith('w') ? result.left + result.width : result.left).toBe(corner.endsWith('w') ? box.left + box.width : box.left);
  }
  expect(resizeFactor(box, frame, 'se', -10000, -10000)).toBe(.01);
});
