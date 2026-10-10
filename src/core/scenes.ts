import { editClips, splitClip } from './clips';
import type { EditSettings, MediaAsset } from './types';
export interface SceneOptions { threshold: number; minGap: number }
export interface SceneScan { times: number[]; truncated: boolean }
export const defaultSceneOptions = (): SceneOptions => ({ threshold: .25, minGap: .5 });
export function parseSceneOptions(value: unknown): SceneOptions {
  const options = value as SceneOptions;
  if (!options || !Number.isFinite(options.threshold) || options.threshold < .05 || options.threshold > .9 || !Number.isFinite(options.minGap) || options.minGap < .1 || options.minGap > 10) throw new Error('Choose a scene threshold from 0.05–0.90 and a gap from 0.1–10 seconds.');
  return { threshold: options.threshold, minGap: options.minGap };
}
export function sceneArgs(asset: MediaAsset, input: string, value: SceneOptions): string[] {
  const options = parseSceneOptions(value);
  if (asset.kind !== 'video') throw new Error('Scene detection requires video.');
  return ['-hide_banner', '-i', input, '-map', '0:V:0', '-an', '-vf', `setpts=PTS-STARTPTS,scale=320:180:force_original_aspect_ratio=decrease,format=rgb24,select='gt(scene,${options.threshold})',showinfo`, '-fps_mode', 'passthrough', '-f', 'null', '-'];
}
export class SceneCollector {
  private times: number[] = []; private truncated = false;
  constructor(private minGap: number) {}
  push(line: string) {
    const match = line.match(/\bpts_time:\s*([\d.eE+-]+)/);
    if (!match) return; const time = Number(match[1]);
    if (!Number.isFinite(time) || time < .05 || time - (this.times.at(-1) ?? -Infinity) < this.minGap) return;
    if (this.times.length >= 500) { this.truncated = true; return; }
    this.times.push(time);
  }
  finish(duration: number): SceneScan { return { times: this.times.filter(time => time <= duration - .05), truncated: this.truncated }; }
}
export function splitAtScenes(edit: EditSettings, times: readonly number[]): Partial<EditSettings> {
  let next = edit;
  for (const time of [...new Set(times)].filter(Number.isFinite).sort((a, b) => a - b)) {
    const clip = editClips(next).find(clip => time - clip.start >= .05 && clip.end - time >= .05);
    if (clip) { if (editClips(next).length >= 1000) throw new Error('A timeline can contain up to 1,000 clips.'); next = { ...next, ...splitClip(next, clip.id, time) }; }
  }
  return next === edit ? {} : { clips: next.clips };
}
