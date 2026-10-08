export function time(seconds: number): string {
  if (!Number.isFinite(seconds)) return '0:00.0';
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  return `${minutes}:${(Math.max(0, seconds) % 60).toFixed(1).padStart(4, '0')}`;
}
export function bytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 ** 2).toFixed(1)} MB`;
}
