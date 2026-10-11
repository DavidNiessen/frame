import { useRef } from 'react';

/** Read current values inside mount-only listeners without restarting their lifecycle. */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
