import type { BrowserWindow, Rectangle } from 'electron';
const outlines = new WeakMap<BrowserWindow, string>();

/** Match the 14px island corners without making Windows/Linux windows transparent. */
function roundedArea(width: number, height: number, top: number): Rectangle[] {
  const radius = Math.min(14, Math.floor(Math.min(width, height) / 2));
  const rows: Rectangle[] = [{ x: 0, y: top + radius, width, height: height - radius * 2 }];
  for (let row = 0; row < radius; row++) {
    const inset = Math.ceil(radius - Math.sqrt(radius ** 2 - (radius - row - .5) ** 2));
    rows.push({ x: inset, y: top + row, width: width - inset * 2, height: 1 });
    rows.push({ x: inset, y: top + height - row - 1, width: width - inset * 2, height: 1 });
  }
  return rows;
}
export function updateWindowOutline(window: BrowserWindow, inset: number, expanded: boolean) {
  if (process.platform === 'darwin') return; // macOS uses the window's transparent backing.
  const content = window.getContentBounds(), bounds = window.getBounds();
  const { width, height } = content, x = content.x - bounds.x, y = content.y - bounds.y;
  const key = [width, height, x, y, inset, expanded].join(':');
  if (outlines.get(window) === key) return;
  const areas = roundedArea(width, Math.max(1, height - inset), inset);
  if (expanded && inset) areas.push(...roundedArea(width, inset - 6, 0));
  // Windows can inset the content inside the native bounds when maximized.
  const shape = areas.map(rect => ({ ...rect, x: rect.x + x, y: rect.y + y }));
  // SetWindowRgn can synchronously report a window-position change; skip repeated regions.
  outlines.set(window, key);
  try { window.setShape(shape); } catch (error) { outlines.delete(window); throw error; }
}
