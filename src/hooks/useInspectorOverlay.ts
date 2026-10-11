import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
/** Modeless editors share the inspector's full-height surface and leave playback accessible. */
export function useInspectorOverlay(
  ref: RefObject<HTMLDialogElement | null>,
  close: () => void,
  keepView = false,
) {
  const initialKeepView = useRef(keepView);
  const islandWidth = useRef(320),
    latestClose = useRef(close);
  latestClose.current = close;
  const [bounds, setBounds] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  }>();
  useLayoutEffect(() => {
    const island = document.getElementById('media-inspector');
    if (!island) return;
    const stacked = () =>
      island.closest('[data-layout="stacked"]:not([data-expanded="true"])') !== null;
    // On phones, follow the inspector as the page scrolls instead of covering
    // the preview when users scroll back to position a caption.
    function position() {
      const original = island!.getBoundingClientRect();
      if (original.width) islandWidth.current = original.width;
      const rect =
        original.width && original.height
          ? original
          : document.getElementById('media-preview')!.getBoundingClientRect();
      const width = Math.min(original.width || islandWidth.current, rect.width, innerWidth - 24);
      const height = Math.min(rect.height, innerHeight - 24);
      const top = Math.max(
        12,
        stacked() ? rect.top : Math.min(rect.top, innerHeight - height - 12),
      );
      setBounds({
        top,
        left: Math.max(
          12,
          Math.min(original.width ? rect.left : rect.right - width, innerWidth - width - 12),
        ),
        width,
        height,
      });
    }
    position();
    const observer = new ResizeObserver(position);
    observer.observe(island);
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
    };
  }, []);
  useLayoutEffect(() => {
    const island = document.getElementById('media-inspector');
    if (!keepView && island?.closest('[data-layout="stacked"]:not([data-expanded="true"])'))
      island.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, [keepView]);
  useLayoutEffect(() => {
    const dialog = ref.current,
      opener = document.activeElement as HTMLElement | null;
    if (!dialog) return;
    if (!initialKeepView.current)
      dialog.querySelector<HTMLButtonElement>('[data-close]')?.focus({ preventScroll: true });
    function outside(event: PointerEvent) {
      if (
        (event.target as HTMLElement)?.closest(
          '[data-preview-playback], [data-frame-object], [data-effect-timeline]',
        )
      )
        return;
      if (!dialog!.contains(event.target as Node)) latestClose.current();
    }
    function focusOutside(event: FocusEvent) {
      if (
        (event.target as HTMLElement)?.closest(
          '[data-preview-playback], [data-frame-object], [data-effect-timeline]',
        )
      )
        return;
      if (event.target !== document.body && !dialog!.contains(event.target as Node))
        latestClose.current();
    }
    function escape(event: KeyboardEvent) {
      if (
        event.key === 'Escape' &&
        !event.defaultPrevented &&
        !document.querySelector('dialog[open]:not(.effect-settings-overlay)')
      ) {
        event.preventDefault();
        event.stopPropagation();
        latestClose.current();
      }
    }
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', focusOutside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
      document.removeEventListener('focusin', focusOutside);
      dialog
        .querySelectorAll('audio, video')
        .forEach((media) => (media as HTMLMediaElement).pause());
      if (dialog.contains(document.activeElement) && opener?.isConnected)
        opener.focus({ preventScroll: true });
    };
  }, [ref]);
  return bounds;
}
