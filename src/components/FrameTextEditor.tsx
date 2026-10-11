import { useLayoutEffect, useRef, useState } from 'react';
export function FrameTextEditor({
  text,
  label,
  width,
  save,
  cancel,
}: {
  text: string;
  label: string;
  width: number;
  save: (text: string) => void;
  cancel: () => void;
}) {
  const [value, setValue] = useState(text),
    ref = useRef<HTMLTextAreaElement>(null),
    finished = useRef(false);
  useLayoutEffect(() => {
    ref.current?.focus({ preventScroll: true });
    ref.current?.select();
  }, []);
  useLayoutEffect(() => {
    const input = ref.current!;
    input.style.height = '0px';
    input.style.height = `${input.scrollHeight}px`;
  }, [value]);
  function finish() {
    if (finished.current) return;
    finished.current = true;
    const next = value.replace(/\0/g, '');
    if (next !== text) save(next);
    else cancel();
  }
  return (
    <textarea
      ref={ref}
      className="frame-text-editor"
      aria-label={label}
      style={{ width: Math.max(100, width) }}
      maxLength={2000}
      value={value}
      onPointerDown={(event) => event.stopPropagation()}
      onChange={(event) => setValue(event.target.value)}
      onBlur={finish}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          finished.current = true;
          cancel();
        }
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          finish();
        }
      }}
    />
  );
}
