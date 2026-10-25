export const hardwareEncoders = [
  'h264_videotoolbox',
  'h264_nvenc',
  'h264_qsv',
  'h264_amf',
] as const;
export type HardwareEncoder = (typeof hardwareEncoders)[number];
export type Acceleration = 'software' | 'auto' | HardwareEncoder;
export interface DesktopCapabilities {
  encoders: HardwareEncoder[];
}
export interface PreviewProxy {
  id: string;
  url: string;
  size: number;
}
export function parseAcceleration(value: unknown): Acceleration {
  if (value === undefined) return 'software';
  if (
    value !== 'software' &&
    value !== 'auto' &&
    !hardwareEncoders.includes(value as HardwareEncoder)
  )
    throw new Error('Invalid hardware encoder choice.');
  return value as Acceleration;
}
const threadOptions = ['-threads', '-filter_threads', '-filter_complex_threads'];
/**
 * Removes thread caps so FFmpeg sizes its decoder, filter and encoder pools to the machine.
 * Interactive previews keep their caps; user-started exports should finish as fast as possible.
 */
export function allCores(plan: string[]): string[] {
  const result: string[] = [];
  for (let i = 0; i < plan.length; i++) {
    if (threadOptions.includes(plan[i]) && i + 1 < plan.length - 1) {
      i++;
      continue;
    }
    result.push(plan[i]);
  }
  return result;
}
export function hardwarePlan(plan: string[], encoder: HardwareEncoder, bitrate: number): string[] {
  if (!plan.some((arg, i) => arg === '-c:v' && plan[i + 1] === 'libx264')) return plan;
  const result: string[] = [];
  for (let i = 0; i < plan.length; i++) {
    if (plan[i] === '-crf' || plan[i] === '-preset') {
      i++;
      continue;
    }
    if (plan[i] === '-c:v' && plan[i + 1] === 'libx264') {
      result.push('-c:v', encoder);
      i++;
      continue;
    }
    if (plan[i] === '-pix_fmt') {
      result.push('-pix_fmt', encoder === 'h264_qsv' ? 'nv12' : 'yuv420p');
      i++;
      continue;
    }
    result.push(plan[i]);
  }
  const extra = [
    ...(!result.includes('-b:v') ? ['-b:v', `${Math.max(100, Math.round(bitrate))}k`] : []),
    ...(encoder === 'h264_videotoolbox' ? ['-allow_sw', '0'] : []),
  ];
  result.splice(result.length - 1, 0, ...extra);
  return result;
}
export async function hardwareFallback(
  software: string[],
  hardware: string[] | null,
  execute: (plan: string[]) => Promise<void>,
  cancelled: () => boolean,
): Promise<void> {
  if (hardware) {
    try {
      await execute(hardware);
      return;
    } catch (error) {
      if (cancelled()) throw error;
    }
  }
  if (cancelled()) throw new Error('Processing cancelled.');
  await execute(software);
}

export function hardwareBitrate(
  width: number,
  height: number,
  quality: 'high' | 'balanced' | 'small',
): number {
  return Math.max(
    300,
    Math.round(
      (width * height * 30 * { high: 0.12, balanced: 0.07, small: 0.035 }[quality]) / 1000,
    ),
  );
}
