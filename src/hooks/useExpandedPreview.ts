import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/** Expand the existing preview without replacing its media element or playback state. */
export function useExpandedPreview(enabled: boolean) {
  const panel = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  const expanded = enabled && open;
  const from = useRef<DOMRect | null>(null),
    animation = useRef<Animation | null>(null);
  const scroll = useRef(0);
  const toggle = useCallback(() => {
    from.current = panel.current?.getBoundingClientRect() ?? null;
    animation.current?.cancel();
    if (!expanded) scroll.current = window.scrollY;
    setOpen(!expanded);
  }, [expanded]);
  useEffect(() => {
    if (!enabled) setOpen(false);
  }, [enabled]);
  useLayoutEffect(() => {
    const before = from.current,
      element = panel.current;
    from.current = null;
    if (!before || !element) return;
    window.scrollTo({ top: expanded ? 0 : scroll.current, behavior: 'instant' });
    const after = element.getBoundingClientRect();
    if (
      matchMedia('(prefers-reduced-motion: reduce)').matches ||
      !before.width ||
      !after.width ||
      !after.height
    )
      return;
    animation.current = element.animate(
      [
        {
          transform: `translate(${before.x - after.x}px, ${before.y - after.y}px) scale(${before.width / after.width}, ${before.height / after.height})`,
          transformOrigin: 'top left',
          zIndex: 2,
        },
        { transform: 'none', transformOrigin: 'top left', zIndex: 2 },
      ],
      { duration: 280, easing: 'cubic-bezier(.22, 1, .36, 1)' },
    );
    return () => animation.current?.cancel();
  }, [expanded]);
  useEffect(() => {
    if (!expanded) return;
    const escape = (event: KeyboardEvent) => {
      if (
        event.key !== 'Escape' ||
        event.defaultPrevented ||
        document.querySelector('dialog[open]')
      )
        return;
      event.preventDefault();
      toggle();
      panel.current
        ?.querySelector<HTMLButtonElement>('[data-preview-expand]')
        ?.focus({ preventScroll: true });
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [expanded, toggle]);
  return { expanded, toggle, panel };
}
