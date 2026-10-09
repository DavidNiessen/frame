import { spawn } from 'node:child_process';
import { basename, dirname, resolve } from 'node:path';
import { realpath, stat } from 'node:fs/promises';
import { isMediaFilename } from '../src/core/imports';
import type { ExportProgress } from '../src/core/types';
import { stopProcessTree } from './process-tree';
import { youtubeFailure } from './youtube-plan';

export async function runYoutubeDownloader(binary: string, args: string[], directory: string, mode: 'video' | 'audio', signal: AbortSignal, progress: (value: ExportProgress) => void) {
  signal.throwIfAborted();
  const child = spawn(binary, args, {
    cwd: directory, windowsHide: true, detached: process.platform !== 'win32',
    // Own the standalone bootloader's extracted files as well as media fragments.
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', TMPDIR: directory, TEMP: directory, TMP: directory }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let pending = '', errors = '', downloaded = '', stopping: Promise<void> | undefined, timedOut = false;
  const stop = () => { stopping ??= stopProcessTree(child); };
  let timer: ReturnType<typeof setTimeout>;
  const reset = () => { clearTimeout(timer); timer = setTimeout(() => { timedOut = true; stop(); }, 120000); };
  signal.addEventListener('abort', stop, { once: true }); if (signal.aborted) stop(); reset();
  try {
    await new Promise<void>((accept, reject) => {
      child.stdout.on('data', chunk => {
        reset(); pending += chunk.toString();
        const lines = pending.split(/\r?\n/); pending = lines.pop()!.slice(-16000);
        for (const line of lines) {
          if (line.startsWith('FRAME_FILE:')) { try { downloaded = JSON.parse(line.slice(11)); } catch { /* Missing path is reported below. */ } }
          if (line.startsWith('FRAME_PROGRESS:')) {
            try {
              const value = JSON.parse(line.slice(15)); const total = Number(value.total || value.estimate), done = Number(value.downloaded);
              progress({ ratio: total > 0 && Number.isFinite(done) ? Math.max(0, Math.min(.9, done / total * .9)) : 0, message: value.status === 'finished' ? 'Preparing downloaded media…' : mode === 'audio' ? 'Downloading YouTube audio…' : 'Downloading YouTube video…' });
            } catch { /* Other downloader output is never sent to the renderer. */ }
          }
          errors = (errors + '\n' + line).slice(-12000);
        }
      });
      child.stderr.on('data', data => { reset(); errors = (errors + data).slice(-12000); });
      child.once('error', () => reject(new Error('The bundled YouTube downloader could not start. Reinstall Frame or run pnpm setup:desktop.')));
      child.once('close', code => code === 0 ? accept() : reject(new Error(youtubeFailure(errors))));
    });
    if (signal.aborted || timedOut) throw new Error('YouTube import cancelled.');
    if (typeof downloaded !== 'string' || !downloaded) throw new Error(youtubeFailure(errors));
    const path = await realpath(resolve(directory, downloaded));
    if (dirname(path) !== await realpath(directory) || !isMediaFilename(basename(path)) || !(await stat(path)).isFile()) throw new Error('The YouTube downloader did not return a supported media file.');
    progress({ ratio: .98, message: 'Download complete. Reading media…' }); return path;
  } catch (error) {
    if (signal.aborted) throw new Error('YouTube import cancelled.');
    if (timedOut) throw new Error('YouTube stopped responding. Try again later.');
    throw error;
  } finally { clearTimeout(timer!); signal.removeEventListener('abort', stop); await stopping; }
}
