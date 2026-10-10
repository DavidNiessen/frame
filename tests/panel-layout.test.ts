import { expect, it } from 'vitest';
import { defaultPanelSizes, editorPanelLayout, readPanelSizes } from '../src/core/panel-layout';
it('ignores invalid saved sizes and constrains imported preferences', () => {
  expect(readPanelSizes({ library: null, inspector: Infinity, timeline: 'large' })).toEqual(defaultPanelSizes);
  expect(readPanelSizes({ library: 9000, inspector: -1, timeline: 9000 })).toEqual({ library: 400, inspector: 280, timeline: 2000 });
});
it('protects the preview width and height while adapting to a smaller window', () => {
  for (const width of [1080, 1200, 1600]) for (const height of [552, 700, 1000]) {
    const layout = editorPanelLayout({ library: 400, inspector: 480, timeline: 520 }, width, height);
    expect(width - layout.library - layout.inspector - 24).toBeGreaterThanOrEqual(440);
    expect(height - layout.timeline - 12).toBeGreaterThanOrEqual(240);
  }
  const tablet = editorPanelLayout(defaultPanelSizes, 728, 680);
  expect(tablet.mode).toBe('medium'); expect(728 - tablet.inspector - 12).toBeGreaterThanOrEqual(360);
  expect(editorPanelLayout(defaultPanelSizes, 358, 680).mode).toBe('stacked');
});

it('divides the player and timeline equally by default, including tall windows', () => {
  for (const height of [552, 700, 1000, 1600]) {
    const layout = editorPanelLayout(defaultPanelSizes, 1440, height);
    expect(Math.abs(layout.timeline - (height - layout.timeline - 12))).toBeLessThanOrEqual(1);
  }
  const phone = editorPanelLayout(defaultPanelSizes, 390, 590, 844);
  expect(phone.timeline).toBe(422);
  expect(editorPanelLayout(readPanelSizes({ timeline: 248 }), 1440, 1000).timeline).toBe(248);
});
