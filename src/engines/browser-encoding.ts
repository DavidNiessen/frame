import type { FFmpeg } from '@ffmpeg/ffmpeg';
import type { GifPass } from '../core/gif-output';
import type { ExportProgress, FormatId } from '../core/types';

/** A separate palette pass avoids queueing the entire decoded movie inside WASM. */
export async function encodeBrowserOutput(
  ff: FFmpeg,
  format: FormatId,
  plan: (pass: GifPass | undefined, destination: string) => string[],
  output: string,
  duration: number,
  onProgress: (progress: ExportProgress) => void,
) {
  const errors: string[] = [];
  const log = ({ message }: { message: string }) => {
    errors.push(message);
    if (errors.length > 15) errors.shift();
  };
  const palette = `palette-${crypto.randomUUID()}.png`;
  let palettePass = format === 'gif';
  const progress = ({ time }: { time: number }) => {
    const ratio = Math.min(0.99, Math.max(0, time / 1e6 / duration));
    onProgress({
      ratio: format === 'gif' ? (palettePass ? ratio * 0.35 : 0.35 + ratio * 0.65) : ratio,
      message: palettePass ? 'Building the GIF color palette…' : 'Encoding your media locally…',
    });
  };
  const run = async (pass: GifPass | undefined, destination: string) => {
    const code = await ff.exec(plan(pass, destination));
    if (code !== 0) throw new Error(`Export failed. ${errors.slice(-4).join(' ')}`.trim());
  };
  ff.on('log', log);
  ff.on('progress', progress);
  try {
    if (format === 'gif') {
      await run({ kind: 'palette' }, palette);
      palettePass = false;
      onProgress({ ratio: 0.35, message: 'Encoding your GIF locally…' });
      await run({ kind: 'encode', path: palette }, output);
    } else await run(undefined, output);
  } finally {
    ff.off('log', log);
    ff.off('progress', progress);
    if (format === 'gif') await ff.deleteFile(palette).catch(() => {});
  }
}
