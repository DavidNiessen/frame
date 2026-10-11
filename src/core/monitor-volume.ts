const key = 'frame-monitor-volume';
let volume = 1;
try {
  const saved = localStorage.getItem(key);
  if (saved !== null && Number.isFinite(Number(saved)))
    volume = Math.max(0, Math.min(1, Number(saved)));
} catch {
  /* Monitoring remains available without storage. */
}
const listeners = new Set<() => void>();
export function monitorVolume() {
  return volume;
}
export function setMonitorVolume(value: number) {
  if (!Number.isFinite(value)) return;
  volume = Math.max(0, Math.min(1, value));
  try {
    localStorage.setItem(key, String(volume));
  } catch {
    /* Storage is optional. */
  }
  for (const listener of listeners) listener();
}
export function subscribeMonitorVolume(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
if (typeof window !== 'undefined')
  window.addEventListener('storage', (event) => {
    if (event.key !== key) return;
    const next = event.newValue === null ? 1 : Number(event.newValue);
    if (!Number.isFinite(next)) return;
    volume = Math.max(0, Math.min(1, next));
    for (const listener of listeners) listener();
  });
