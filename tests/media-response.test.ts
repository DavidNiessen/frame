import { expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mediaResponse } from '../electron/media-response';

it('serves accurate file lengths and byte ranges needed for desktop audio seeking', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-media-range-'));
  try {
    const file = join(directory, 'audio.wav');
    await writeFile(file, '0123456789');
    const complete = await mediaResponse(file, new Request('https://media.test/audio'));
    expect(complete.headers.get('content-type')).toBe('audio/wav');
    expect(complete.headers.get('content-length')).toBe('10');
    expect(complete.headers.get('accept-ranges')).toBe('bytes');
    expect(await complete.text()).toBe('0123456789');
    for (const [range, body, contentRange] of [
      ['bytes=2-5', '2345', 'bytes 2-5/10'],
      ['bytes=7-', '789', 'bytes 7-9/10'],
      ['bytes=-3', '789', 'bytes 7-9/10'],
      ['bytes=7-99', '789', 'bytes 7-9/10'],
      ['bytes=-99', '0123456789', 'bytes 0-9/10'],
    ]) {
      const response = await mediaResponse(
        file,
        new Request('https://media.test/audio', { headers: { Range: range } }),
      );
      expect(response.status).toBe(206);
      expect(response.headers.get('content-range')).toBe(contentRange);
      expect(response.headers.get('content-length')).toBe(String(body.length));
      expect(await response.text()).toBe(body);
    }
    const head = await mediaResponse(
      file,
      new Request('https://media.test/audio', { method: 'HEAD' }),
    );
    expect(head.headers.get('content-length')).toBe('10');
    expect(await head.text()).toBe('');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it('rejects invalid ranges and serves missing or empty files without hanging', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-media-range-'));
  try {
    const file = join(directory, 'audio.wav');
    await writeFile(file, '0123456789');
    for (const range of [
      'bytes=10-',
      'bytes=5-2',
      'bytes=-0',
      'bytes=-',
      'bytes=0-2,4-6',
      'bytes=999999999999999999999-',
    ]) {
      const response = await mediaResponse(
        file,
        new Request('https://media.test/audio', { headers: { Range: range } }),
      );
      expect(response.status).toBe(416);
      expect(response.headers.get('content-range')).toBe('bytes */10');
    }
    await writeFile(file, '');
    const empty = await mediaResponse(file, new Request('https://media.test/audio'));
    expect(empty.headers.get('content-length')).toBe('0');
    expect(await empty.text()).toBe('');
    expect(
      (await mediaResponse(join(directory, 'missing.wav'), new Request('https://media.test/audio')))
        .status,
    ).toBe(404);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
