import { useEffect } from 'react';

/** A shared, eased light source moves opposite the pointer without React renders. */
export function useBorderLight() {
  useEffect(() => {
    const surfaces = () => document.querySelectorAll<HTMLElement>('.app-header, .workspace-bar, .app-footer, .panel, .preview-panel, .empty-stage, .conversion-intro, .settings-card, .recovery-banner, .mini-card');
    const pointer = matchMedia('(hover: hover) and (pointer: fine)');
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let x = 25, y = 15, targetX = x, targetY = y, frame = 0, last = 0;
    const enabled = () => pointer.matches && !motion.matches && !document.hidden;
    const reset = () => {
      cancelAnimationFrame(frame); frame = 0;
      x = targetX = 25; y = targetY = 15;
      for (const element of surfaces()) { element.style.removeProperty('--border-light-x'); element.style.removeProperty('--border-light-y'); }
    };
    function tick(time: number) {
      frame = 0;
      if (!enabled()) { reset(); return; }
      const ease = 1 - Math.exp(-Math.max(1, Math.min(64, time - last)) / 140); last = time;
      x += (targetX - x) * ease; y += (targetY - y) * ease;
      const settled = Math.abs(targetX - x) + Math.abs(targetY - y) < .05;
      if (settled) { x = targetX; y = targetY; }
      // Non-inherited properties keep updates out of the media/timeline subtrees.
      for (const element of surfaces()) {
        element.style.setProperty('--border-light-x', `${x.toFixed(3)}%`);
        element.style.setProperty('--border-light-y', `${y.toFixed(3)}%`);
      }
      if (!settled) frame = requestAnimationFrame(tick);
    }
    function aim(nextX: number, nextY: number) {
      if (!enabled()) return;
      targetX = nextX; targetY = nextY;
      if (!frame) { last = performance.now(); frame = requestAnimationFrame(tick); }
    }
    const move = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      aim(100 - Math.max(0, Math.min(1, event.clientX / innerWidth)) * 100, 100 - Math.max(0, Math.min(1, event.clientY / innerHeight)) * 100);
    };
    const leave = (event: PointerEvent) => { if (!event.relatedTarget) aim(25, 15); };
    const blur = () => aim(25, 15);
    const preference = () => { if (!enabled()) reset(); };
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerout', leave, { passive: true });
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', preference);
    pointer.addEventListener('change', preference); motion.addEventListener('change', preference);
    return () => {
      reset(); window.removeEventListener('pointermove', move); window.removeEventListener('pointerout', leave); window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', preference);
      pointer.removeEventListener('change', preference); motion.removeEventListener('change', preference);
    };
  }, []);
}
