import { useEffect } from 'react';

/** One eased light source follows the pointer across the whole app viewport. */
export function useBorderLight() {
  useEffect(() => {
    const surfaces = () => document.querySelectorAll<HTMLElement>('.app-header, .workspace-bar, .app-footer, .panel, .preview-panel, .empty-stage, .conversion-intro, .settings-card, .recovery-banner, .mini-card, .desktop-window-frame');
    const pointer = matchMedia('(hover: hover) and (pointer: fine)');
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let x = 25, y = 15, targetX = x, targetY = y, frame = 0, last = 0;
    const enabled = () => pointer.matches && !motion.matches && !document.hidden;
    function paint() {
      // Read geometry together before writing, keeping one shared light position.
      const points = Array.from(surfaces(), element => {
        const bounds = element.getBoundingClientRect();
        return { element, left: bounds.left + element.clientLeft, top: bounds.top + element.clientTop };
      });
      for (const { element, left, top } of points) {
        element.style.setProperty('--border-light-x', `${(x * innerWidth / 100 - left).toFixed(3)}px`);
        element.style.setProperty('--border-light-y', `${(y * innerHeight / 100 - top).toFixed(3)}px`);
      }
    }
    const reset = () => {
      cancelAnimationFrame(frame); frame = 0;
      x = targetX = 25; y = targetY = 15;
      paint();
    };
    function tick(time: number) {
      frame = 0;
      if (!enabled()) { reset(); return; }
      const ease = 1 - Math.exp(-Math.max(1, Math.min(64, time - last)) / 140); last = time;
      x += (targetX - x) * ease; y += (targetY - y) * ease;
      const settled = Math.abs(targetX - x) + Math.abs(targetY - y) < .05;
      if (settled) { x = targetX; y = targetY; }
      // Non-inherited properties keep updates out of the media/timeline subtrees.
      paint();
      if (!settled) frame = requestAnimationFrame(tick);
    }
    function aim(nextX: number, nextY: number) {
      if (!enabled()) return;
      targetX = nextX; targetY = nextY;
      if (!frame) { last = performance.now(); frame = requestAnimationFrame(tick); }
    }
    const move = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      aim(Math.max(0, Math.min(1, event.clientX / innerWidth)) * 100, Math.max(0, Math.min(1, event.clientY / innerHeight)) * 100);
    };
    const leave = (event: PointerEvent) => { if (!event.relatedTarget) aim(25, 15); };
    const blur = () => aim(25, 15);
    const preference = () => { if (!enabled()) reset(); };
    const layout = () => { if (!frame) paint(); };
    const resized = new ResizeObserver(layout), observed = new Set<HTMLElement>();
    const refresh = () => {
      const current = new Set(surfaces());
      for (const element of observed) if (!current.has(element)) { resized.unobserve(element); observed.delete(element); }
      for (const element of current) if (!observed.has(element)) { observed.add(element); resized.observe(element); }
      layout();
    };
    const mounted = new MutationObserver(refresh);
    mounted.observe(document.getElementById('root')!, { childList: true, subtree: true }); refresh();
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerout', leave, { passive: true });
    window.addEventListener('blur', blur);
    window.addEventListener('scroll', layout, { capture: true, passive: true });
    window.addEventListener('resize', layout);
    document.addEventListener('visibilitychange', preference);
    pointer.addEventListener('change', preference); motion.addEventListener('change', preference);
    return () => {
      cancelAnimationFrame(frame); mounted.disconnect(); resized.disconnect();
      for (const element of surfaces()) { element.style.removeProperty('--border-light-x'); element.style.removeProperty('--border-light-y'); }
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerout', leave); window.removeEventListener('blur', blur);
      window.removeEventListener('scroll', layout, true); window.removeEventListener('resize', layout);
      document.removeEventListener('visibilitychange', preference);
      pointer.removeEventListener('change', preference); motion.removeEventListener('change', preference);
    };
  }, []);
}
