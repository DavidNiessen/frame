import { useEffect, useState, type RefObject } from 'react';
import { useLatest } from './useLatest';

/** Keep download status and window controls outside the blocked workspace. */
export function useUrlImportOverlay(
  dialog: RefObject<HTMLDialogElement | null>,
  open: boolean,
  actions: { running: boolean; close: () => void; cancel: () => void },
) {
  const latest = useLatest(actions);
  const [bounds, setBounds] = useState({ top: 0, bottom: 0 });
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const measure = () => {
      const top = Math.max(
        0,
        document.querySelector('.desktop-window-content')?.getBoundingClientRect().top ?? 0,
      );
      const footer = document.querySelector('.app-footer')?.getBoundingClientRect();
      const bottom = Math.max(0, innerHeight - Math.min(innerHeight, footer?.top ?? innerHeight));
      setBounds((current) =>
        current.top === top && current.bottom === bottom ? current : { top, bottom },
      );
    };
    const allowed = (element: HTMLElement) =>
      !!element.closest('.url-import-dialog, .app-footer, .desktop-chrome');
    const focusable = () =>
      [
        ...(dialog.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]',
        ) ?? []),
        ...document.querySelectorAll<HTMLElement>(
          '.app-footer .footer-cancel, .desktop-window-buttons button:not(:disabled)',
        ),
      ].filter(
        (element) =>
          element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden',
      );
    const key = (event: KeyboardEvent) => {
      if (document.querySelector('dialog:modal')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (latest.current.running) latest.current.cancel();
        else latest.current.close();
      } else if (event.key === 'Tab') {
        const items = focusable(),
          index = items.indexOf(document.activeElement as HTMLElement);
        if (!items.length) return;
        event.preventDefault();
        items[(index + (event.shiftKey ? -1 : 1) + items.length) % items.length].focus();
      }
    };
    const focus = (event: FocusEvent) => {
      if (document.querySelector('dialog:modal')) return;
      if (!allowed(event.target as HTMLElement)) focusable()[0]?.focus();
    };
    const observer = new ResizeObserver(measure);
    for (const element of document.querySelectorAll('.app-footer, .desktop-window-content'))
      observer.observe(element);
    measure();
    document.addEventListener('keydown', key, true);
    document.addEventListener('focusin', focus);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      observer.disconnect();
      document.removeEventListener('keydown', key, true);
      document.removeEventListener('focusin', focus);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      previous?.focus();
    };
  }, [dialog, open, latest]);
  return bounds;
}
