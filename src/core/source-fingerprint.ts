/** Sample 128 KiB at most, so large desktop media does not require a full-file hash. */
export const FINGERPRINT_SAMPLE_BYTES = 65536;
export const fingerprintHeader = (size: number) => new TextEncoder().encode(`frame-source-v1:${size}:`);
export async function sourceFingerprint(file: Blob): Promise<string> {
  const first = new Uint8Array(await file.slice(0, FINGERPRINT_SAMPLE_BYTES).arrayBuffer());
  const last = file.size > FINGERPRINT_SAMPLE_BYTES ? new Uint8Array(await file.slice(Math.max(FINGERPRINT_SAMPLE_BYTES, file.size - FINGERPRINT_SAMPLE_BYTES)).arrayBuffer()) : new Uint8Array();
  const header = fingerprintHeader(file.size), data = new Uint8Array(header.length + first.length + last.length); data.set(header); data.set(first, header.length); data.set(last, header.length + first.length);
  const hash = await crypto.subtle.digest('SHA-256', data); return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}
