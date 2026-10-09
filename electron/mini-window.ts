import { BrowserWindow, screen } from 'electron';
import type { Rectangle } from 'electron';

export function miniBounds(work: Rectangle, expanded: boolean): Rectangle {
  const margin = Math.min(16, work.width / 20, work.height / 20);
  const width = Math.min(expanded ? 460 : 360, work.width - margin * 2);
  const height = Math.min(expanded ? 740 : 78, work.height - margin * 2);
  return { x: Math.round(work.x + work.width - width - margin), y: Math.round(work.y + work.height - height - margin), width: Math.round(width), height: Math.round(height) };
}
export function configureMiniWindow(window: BrowserWindow) {
  let expanded = true, timer: ReturnType<typeof setInterval> | undefined;
  let displayId = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id;
  function resize(animate: boolean) {
    if (timer) clearInterval(timer);
    const display = screen.getAllDisplays().find(display => display.id === displayId) || screen.getDisplayMatching(window.getBounds());
    displayId = display.id;
    const target = miniBounds(display.workArea, expanded);
    if (!animate) { window.setBounds(target); return; }
    const start = window.getBounds(), begun = Date.now();
    timer = setInterval(() => {
      if (window.isDestroyed()) { clearInterval(timer); return; }
      const ratio = Math.min(1, (Date.now() - begun) / 220), eased = 1 - (1 - ratio) ** 3;
      const bounds = Object.fromEntries(Object.entries(target).map(([key, value]) => [key, Math.round(start[key as keyof Rectangle] + (value - start[key as keyof Rectangle]) * eased)])) as unknown as Rectangle;
      window.setBounds(bounds);
      if (ratio === 1) clearInterval(timer);
    }, 16);
  }
  const update = () => resize(false);
  screen.on('display-metrics-changed', update); screen.on('display-removed', update);
  window.once('closed', () => { if (timer) clearInterval(timer); screen.removeListener('display-metrics-changed', update); screen.removeListener('display-removed', update); });
  resize(false);
  return { setExpanded(value: unknown, reducedMotion: unknown) {
    if (typeof value !== 'boolean' || typeof reducedMotion !== 'boolean') throw new Error('Invalid mini-converter layout.');
    if (expanded === value) return;
    expanded = value; resize(!reducedMotion);
  } };
}
