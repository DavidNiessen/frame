import type { WindowIpc } from './window-ipc';
import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import {
  hardwareEncoders,
  hardwarePlan,
  hardwareFallback,
  type Acceleration,
  type DesktopCapabilities,
} from '../src/core/hardware';
import { runFfmpeg } from './native';
import type { MediaJobs } from './jobs';
type Execute = Parameters<Parameters<MediaJobs['run']>[0]>[0];
let cached: DesktopCapabilities | undefined;
async function capabilities(
  execute: Execute,
  jobs: MediaJobs,
  progress: (ratio: number, message: string) => void,
): Promise<DesktopCapabilities> {
  if (cached) return cached;
  const encoders: DesktopCapabilities['encoders'] = [];
  for (let i = 0; i < hardwareEncoders.length; i++) {
    if (jobs.cancelled) throw new Error('Hardware check cancelled.');
    const encoder = hardwareEncoders[i];
    progress(i / hardwareEncoders.length, `Testing ${encoder}…`);
    const plan = hardwarePlan(
      [
        '-f',
        'lavfi',
        '-i',
        'color=black:s=128x128:r=25:d=0.08',
        '-frames:v',
        '2',
        '-an',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-f',
        'null',
        '-',
      ],
      encoder,
      1000,
    );
    const job = runFfmpeg(plan, 0.08, () => {});
    const timer = setTimeout(() => job.child.kill(), 5000);
    try {
      await execute(job);
      encoders.push(encoder);
    } catch (error) {
      if (jobs.cancelled) throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  cached = { encoders };
  return cached;
}
export function registerAcceleration(
  jobs: MediaJobs,
  trusted: (event: IpcMainInvokeEvent) => void,
  ipc: WindowIpc = ipcMain,
) {
  ipc.handle('media:capabilities', (event) => {
    trusted(event);
    return jobs.run((execute) =>
      capabilities(execute, jobs, (ratio, message) => {
        if (!event.sender.isDestroyed()) event.sender.send('media:progress', { ratio, message });
      }),
    );
  });
}
export async function encodeNative(
  plan: string[],
  duration: number,
  mode: Acceleration,
  bitrate: number,
  execute: Execute,
  jobs: MediaJobs,
  progress: (ratio: number, message: string) => void,
) {
  let hardware: string[] | null = null;
  if (mode !== 'software' && plan.some((arg, i) => arg === '-c:v' && plan[i + 1] === 'libx264')) {
    const available = await capabilities(execute, jobs, progress);
    const encoder =
      mode === 'auto' ? available.encoders[0] : available.encoders.find((e) => e === mode);
    if (encoder) hardware = hardwarePlan(plan, encoder, bitrate);
  }
  await hardwareFallback(
    plan,
    hardware,
    (next) =>
      execute(
        runFfmpeg(next, duration, (ratio) =>
          progress(
            ratio,
            next === plan
              ? 'Encoding with portable software FFmpeg…'
              : 'Encoding with hardware acceleration…',
          ),
        ),
      ),
    () => jobs.cancelled,
  );
}
