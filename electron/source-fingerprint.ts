import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';
import { FINGERPRINT_SAMPLE_BYTES, fingerprintHeader } from '../src/core/source-fingerprint';
export async function nativeSourceFingerprint(path: string, size: number): Promise<string> {
  const file = await open(path, 'r');
  try {
    const hash = createHash('sha256').update(fingerprintHeader(size)),
      first = Buffer.alloc(Math.min(size, FINGERPRINT_SAMPLE_BYTES));
    const initial = await file.read(first, 0, first.length, 0);
    hash.update(first.subarray(0, initial.bytesRead));
    if (size > FINGERPRINT_SAMPLE_BYTES) {
      const offset = Math.max(FINGERPRINT_SAMPLE_BYTES, size - FINGERPRINT_SAMPLE_BYTES),
        last = Buffer.alloc(size - offset);
      const tail = await file.read(last, 0, last.length, offset);
      hash.update(last.subarray(0, tail.bytesRead));
    }
    return hash.digest('hex');
  } finally {
    await file.close();
  }
}
