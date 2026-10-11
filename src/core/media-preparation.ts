import type { MediaAsset } from './types';

export const sequenceFrameRate = (asset: MediaAsset) =>
  Math.min(60, Math.max(1, asset.frameRate ?? 30));
/** Match the exact frame boundary produced when different source frame rates are combined. */
export const sequenceOffset = (asset: MediaAsset) =>
  Math.ceil(asset.duration * sequenceFrameRate(asset) - 1e-7) / sequenceFrameRate(asset);
const stem = (name: string) =>
  name
    .replace(/\.[^.]+$/, '')
    .replace(/-sequence$/, '')
    .slice(0, 220);
export const sequenceName = (asset: MediaAsset) => `${stem(asset.name)}-sequence.mp4`;
export const extractedAudioName = (asset: MediaAsset) => `${stem(asset.name)}-audio.flac`;

/** Raw preparation never bakes timeline trims, effects or added audio into the sequence. */
export function appendVideoArgs(
  base: MediaAsset,
  added: MediaAsset,
  inputs: [string, string],
  output: string,
): string[] {
  if (base.kind !== 'video' || added.kind !== 'video')
    throw new Error('Choose two video sources to extend a sequence.');
  if (base.duration + added.duration > 86400) throw new Error('Keep sequences under 24 hours.');
  const width = Math.floor((base.width ?? 640) / 2) * 2,
    height = Math.floor((base.height ?? 360) / 2) * 2;
  const fps = sequenceFrameRate(base),
    audio = base.hasAudio || added.hasAudio;
  const graph: string[] = [];
  [base, added].forEach((source, index) => {
    const length = Math.ceil(source.duration * fps - 1e-7) / fps;
    graph.push(
      `[${index}:V:0]setpts=PTS-STARTPTS,scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps},format=yuv420p,tpad=stop_mode=clone:stop_duration=1,trim=duration=${length},settb=AVTB[v${index}]`,
    );
    if (audio)
      graph.push(
        source.hasAudio
          ? `[${index}:a:0]asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=duration=${length}[a${index}]`
          : `anullsrc=r=48000:cl=stereo,atrim=duration=${length}[a${index}]`,
      );
  });
  graph.push(
    `[v0]${audio ? '[a0]' : ''}[v1]${audio ? '[a1]' : ''}concat=n=2:v=1:a=${audio ? 1 : 0}[video]${audio ? '[audio]' : ''}`,
  );
  return [
    '-y',
    '-i',
    inputs[0],
    '-i',
    inputs[1],
    '-filter_complex',
    graph.join(';'),
    '-map',
    '[video]',
    '-c:v',
    'libx264',
    '-crf',
    '16',
    '-preset',
    'fast',
    '-pix_fmt',
    'yuv420p',
    ...(audio ? ['-map', '[audio]', '-c:a', 'aac', '-b:a', '320k'] : ['-an']),
    '-map_metadata',
    '0',
    '-movflags',
    '+faststart',
    '-threads',
    '2',
    output,
  ];
}
export function extractAudioArgs(asset: MediaAsset, input: string, output: string): string[] {
  if (asset.kind !== 'video' || !asset.hasAudio)
    throw new Error('Select a video with an audio stream to extract.');
  return [
    '-y',
    '-i',
    input,
    '-map',
    '0:a:0',
    '-vn',
    '-c:a',
    'flac',
    '-map_metadata',
    '0',
    '-threads',
    '2',
    output,
  ];
}
