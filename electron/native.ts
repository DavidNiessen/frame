import { editedDuration } from '../src/core/timeline';
import { spawn, type ChildProcess } from 'node:child_process';
import { stat } from 'node:fs/promises';
import ffmpeg from 'ffmpeg-static';
import ffprobe from '@ffprobe-installer/ffprobe';
import { buildExportArgs } from '../src/core/export-plan';
import { parseProbe } from '../src/core/probe';
import type { EditSettings, MediaAsset } from '../src/core/types';

const unpacked = (path: string) => path.replace(/app\.asar([/\\])/, 'app.asar.unpacked$1');
export const ffmpegPath = () => unpacked(ffmpeg!);
export const ffprobePath = () => unpacked(ffprobe.path);

export async function probeFile(path: string) {
  const metadata = await new Promise<string>((resolve, reject) => {
    const child = spawn(ffprobePath(), ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', path], { windowsHide: true });
    let output = ''; let errors = '';
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Reading media timed out.')); }, 30000);
    child.stdout.on('data', data => { output += data; if (output.length > 2_000_000) child.kill(); });
    child.stderr.on('data', data => { errors = (errors + data).slice(-2000); });
    child.on('error', error => { clearTimeout(timeout); reject(error); });
    child.on('close', code => { clearTimeout(timeout); code === 0 ? resolve(output) : reject(new Error(errors || 'Unable to read this media file.')); });
  });
  const info = await stat(path);
  if (!info.isFile()) throw new Error('Select a media file.');
  return { ...parseProbe(JSON.parse(metadata)), size: info.size };
}

export function transcode(input: string, output: string, asset: MediaAsset, edit: EditSettings, progress: (ratio: number) => void): { child: ChildProcess; done: Promise<void> } {
  return runFfmpeg(buildExportArgs(asset, edit, input, output), editedDuration(edit), progress);
}
export function runFfmpeg(plan: string[], duration: number, progress: (ratio: number) => void, onLog?: (line: string) => void): { child: ChildProcess; done: Promise<void> } {
  const args = ['-hide_banner', '-nostdin', '-progress', 'pipe:1', '-nostats', '-filter_threads', '2', '-filter_complex_threads', '2', '-threads', '2', ...plan];
  const child = spawn(ffmpegPath(), args, { windowsHide: true });
  let errors = ''; let pending = '';
  child.stdout!.on('data', data => {
    pending += data;
    const lines = pending.split('\n'); pending = lines.pop()!;
    for (const line of lines) if (line.startsWith('out_time_us=')) {
      const value = Number(line.split('=')[1]);
      if (Number.isFinite(value)) progress(Math.min(0.99, Math.max(0, value / 1e6 / duration)));
    }
  });
  let logBuffer = '';
  child.stderr!.on('data', data => {
    errors = (errors + data).slice(-8000); logBuffer += data;
    const lines = logBuffer.split('\n'); logBuffer = lines.pop()!;
    for (const line of lines) onLog?.(line);
  });
  const done = new Promise<void>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code, signal) => code === 0 ? resolve() : reject(new Error(signal || child.killed ? 'Export cancelled.' : errors || `FFmpeg exited with code ${code}.`)));
  });
  return { child, done };
}
