import { useEffect, useRef, useState } from 'react';
export function useCommandPalette(pause: () => void) {
  const [open, setOpen] = useState(false),
    latest = useRef(pause);
  latest.current = pause;
  const show = () => {
    if (
      document.querySelector(
        'dialog[open]:not(.effect-settings-overlay):not([data-command-palette])',
      )
    )
      return;
    latest.current();
    setOpen(true);
  };
  useEffect(() => {
    function key(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        !(event.ctrlKey || event.metaKey) ||
        event.altKey ||
        event.shiftKey ||
        event.key.toLowerCase() !== 'k'
      )
        return;
      if (
        document.querySelector(
          'dialog[open]:not([data-command-palette]):not(.effect-settings-overlay)',
        )
      )
        return;
      event.preventDefault();
      if (event.repeat) return;
      if (open) setOpen(false);
      else {
        latest.current();
        setOpen(true);
      }
    }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open]);
  return { open, show, close: () => setOpen(false) };
}
