import { getFormat } from './formats';
import { validateEdit } from './export-plan';
import { editedDuration, keptRanges } from './timeline';
import { audioFilters, videoFilters } from './filters';
import { parseOutputSettings, type OutputSettings } from './presets';
import { defaultSettings, type EditSettings, type MediaAsset } from './types';
export interface MediaClip { asset: MediaAsset; edit: EditSettings }
export function compositionAsset(clips: MediaClip[]): MediaAsset {
  if (!clips.length || clips.length > 100) throw new Error('Choose 1–100 clips.');
  clips.forEach(clip => validateEdit(clip.asset, clip.edit));
  const first = clips[0]; const width = first.edit.crop?.width ?? first.asset.width; const height = first.edit.crop?.height ?? first.asset.height;
  return { id: 'composition', name: 'Merged clips', previewUrl: '', size: clips.reduce((n, c) => n + c.asset.size, 0),
    kind: clips.every(c => c.asset.kind === 'video') ? 'video' : 'audio', hasAudio: clips.some(c => c.asset.hasAudio),
    duration: clips.reduce((n, c) => n + editedDuration(c.edit), 0), width: width ? Math.floor(width / 2) * 2 : undefined, height: height ? Math.floor(height / 2) * 2 : undefined };
}
export function buildMergeArgs(clips: MediaClip[], output: OutputSettings, inputs: string[], destination: string): string[] {
  if (clips.length < 2 || inputs.length !== clips.length) throw new Error('Choose at least two clips to merge.');
  const asset = compositionAsset(clips); const settings = parseOutputSettings(output); const edit = { ...defaultSettings(asset), ...settings };
  validateEdit(asset, edit); const format = getFormat(edit.format); const video = format.kind === 'video'; const audio = asset.hasAudio && edit.format !== 'gif';
  const args: string[] = ['-y', '-filter_complex_threads', '2']; const graph: string[] = [];
  clips.forEach(({ asset: source, edit: recipe }, index) => {
    args.push('-ss', String(recipe.start), '-t', String(recipe.end - recipe.start), '-threads', '2', '-i', inputs[index]);
    const ranges = keptRanges(recipe); const v = video; const a = audio && source.hasAudio;
    ranges.forEach((range, r) => {
      const trim = `start=${range.start - recipe.start}:end=${range.end - recipe.start}`;
      if (v) graph.push(`[${index}:V:0]trim=${trim},setpts=PTS-STARTPTS[c${index}r${r}v]`);
      if (a) graph.push(`[${index}:a:0]atrim=${trim},asetpts=PTS-STARTPTS[c${index}r${r}a]`);
    });
    const stream = (type: string) => ranges.length === 1 ? `c${index}r0${type}` : `c${index}cut${type}`;
    if (ranges.length > 1 && (v || a)) graph.push(`${ranges.map((_, r) => `${v ? `[c${index}r${r}v]` : ''}${a ? `[c${index}r${r}a]` : ''}`).join('')}concat=n=${ranges.length}:v=${v ? 1 : 0}:a=${a ? 1 : 0}${v ? `[${stream('v')}]` : ''}${a ? `[${stream('a')}]` : ''}`);
    if (v) graph.push(`[${stream('v')}]${[...videoFilters(source, recipe), `scale=${asset.width}:${asset.height}:force_original_aspect_ratio=decrease`, `pad=${asset.width}:${asset.height}:(ow-iw)/2:(oh-ih)/2`, 'setsar=1', 'fps=30', 'format=yuv420p'].join(',')}[v${index}]`);
    if (a) graph.push(`[${stream('a')}]${[...audioFilters(recipe), 'aresample=48000', 'aformat=sample_fmts=fltp:channel_layouts=stereo'].join(',')}[a${index}]`);
    else if (audio) graph.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${editedDuration(recipe)},asetpts=PTS-STARTPTS[a${index}]`);
  });
  const artwork = format.kind === 'audio' && format.artwork && settings.includeArtwork && clips[0].asset.artworkIndex !== undefined;
  if (artwork) args.push('-i', inputs[0]);
  graph.push(`${clips.map((_, i) => `${video ? `[v${i}]` : ''}${audio ? `[a${i}]` : ''}`).join('')}concat=n=${clips.length}:v=${video ? 1 : 0}:a=${audio ? 1 : 0}${video ? '[mergedv]' : ''}${audio ? '[mergeda]' : ''}`);
  if (edit.format === 'gif') {
    graph.push(`[mergedv]fps=${edit.fps},split[ga][gb];[ga]palettegen[p];[gb][p]paletteuse[gif]`); args.push('-map', '[gif]', '-an', '-loop', '0');
  } else {
    if (video) {
      args.push('-map', '[mergedv]', '-c:v', format.videoCodec!, '-pix_fmt', 'yuv420p');
      if (edit.videoBitrate) args.push('-b:v', `${edit.videoBitrate}k`);
      else { args.push('-crf', String({ high: 18, balanced: 23, small: 30 }[edit.quality])); if (edit.format === 'webm') args.push('-b:v', '0'); }
      if (format.videoCodec === 'libx264') args.push('-preset', 'fast');
      if (edit.format === 'webm') args.push('-deadline', 'good', '-cpu-used', '4');
    }
    if (audio) { args.push('-map', '[mergeda]', '-c:a', format.audioCodec!); if (!['wav', 'flac'].includes(edit.format)) args.push('-b:a', `${edit.audioBitrate}k`); }
  }
  if (artwork) { args.push('-map', `${clips.length}:${clips[0].asset.artworkIndex}`, '-c:v', 'mjpeg', '-disposition:v:0', 'attached_pic'); if (settings.format === 'mp3') args.push('-id3v2_version', '3'); }
  args.push('-filter_complex', graph.join(';'), '-map_metadata', edit.keepMetadata ? '0' : '-1');
  if (['mp4', 'mov', 'm4a'].includes(edit.format)) args.push('-movflags', '+faststart');
  args.push('-t', String(asset.duration), '-threads', '2', destination); return args;
}
