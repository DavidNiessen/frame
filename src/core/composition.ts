import { allAudioLayers } from './effect-instances';
import { mediaTagArgs } from './media-tags';
import { chapterFormats } from './chapters';
import { hasEditedAudio, audioMixGraph, type AudioLayerInput } from './audio-layers';
import { gifPaletteFilters } from './gif-output';
import { audioOutputArgs, outputAudioCodec } from './audio-output';
import { clipFilterGraph } from './clip-filters';
import { resolveSizeTarget } from './size';
import { frameDimensions } from './geometry';
import { embeddedCues, resourcePaths, type RecipeResources } from './resources';
import { subtitleCodec, type SubtitleCue } from './subtitles';
import { defaultTransition, validateTransition, type TransitionSettings } from './transitions';
import { getFormat } from './formats';
import { validateEdit } from './export-plan';
import { editedDuration, keptRanges } from './timeline';
import { audioFilters, videoFilters } from './filters';
import { parseOutputSettings, type OutputSettings } from './presets';
import { defaultSettings, type EditSettings, type MediaAsset } from './types';
export interface MediaClip { asset: MediaAsset; edit: EditSettings }
export function compositionAsset(clips: MediaClip[], transition: TransitionSettings = defaultTransition): MediaAsset {
  if (!clips.length || clips.length > 100) throw new Error('Choose 1–100 clips.');
  clips.forEach(clip => validateEdit(clip.asset, clip.edit));
  const blend = validateTransition(clips, transition);
  const first = clips[0]; const { width, height } = frameDimensions(first.asset, first.edit);
  return { id: 'composition', name: 'Merged clips', previewUrl: '', size: clips.reduce((n, c) => n + c.asset.size, 0),
    kind: clips.every(c => c.asset.kind === 'video') ? 'video' : 'audio', hasAudio: clips.some(c => hasEditedAudio(c.asset, c.edit)),
    duration: clips.reduce((n, c) => n + editedDuration(c.edit), 0) - (blend.type === 'fade' ? blend.duration * (clips.length - 1) : 0), width: width ? Math.floor(width / 2) * 2 : undefined, height: height ? Math.floor(height / 2) * 2 : undefined };
}
export function buildMergeArgs(clips: MediaClip[], output: OutputSettings, inputs: string[], destination: string, transition: TransitionSettings = defaultTransition, resources: RecipeResources[] = clips.map((_, i) => resourcePaths(`clip${i}`)), captionPath = 'merge-captions.srt', mixes: AudioLayerInput[][] = [], chapterPath = `${captionPath}-chapters.ffmetadata`): string[] {
  clips = clips.map(clip => ({ ...clip, edit: { ...clip.edit, audioLayers: allAudioLayers(clip.edit), effectInstances: clip.edit.effectInstances?.filter(instance => instance.effect !== 'mix') } }));
  if (clips.length < 2 || inputs.length !== clips.length) throw new Error('Choose at least two clips to merge.');
  const asset = compositionAsset(clips, transition); const settings = parseOutputSettings(output); const edit = resolveSizeTarget(asset, { ...defaultSettings(asset), ...settings });
  validateEdit(asset, edit); const format = getFormat(edit.format); const video = format.kind === 'video'; const audio = asset.hasAudio && edit.format !== 'gif';
  const args: string[] = ['-y', '-filter_complex_threads', '2']; const graph: string[] = [];
  clips.forEach(({ asset: source, edit: originalRecipe }, index) => {
    const recipe = originalRecipe.audioLayers?.length ? { ...originalRecipe, audioFadeIn: 0, audioFadeOut: 0, effectInstances: originalRecipe.effectInstances?.filter(instance => !instance.effect.startsWith('audioFade')) } : originalRecipe;
    args.push('-ss', String(recipe.start), '-t', String(recipe.end - recipe.start), '-threads', '2', '-i', inputs[index]);
    const ranges = keptRanges(recipe); const v = video; const a = audio && source.hasAudio;
    if (recipe.clips) {
      const prefix = `sequence${index}`;
      graph.push(...clipFilterGraph(source, recipe, String(index), prefix, resources[index], v, a).graph);
      // FFmpeg 6.0 can forward the source EOF timestamp through a speed-adjusted
      // sequence. Cap the resampled stream to its edited duration before joining.
      if (v) graph.push(`[${prefix}v]scale=${asset.width}:${asset.height}:force_original_aspect_ratio=decrease,pad=${asset.width}:${asset.height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p,trim=duration=${editedDuration(recipe)},settb=AVTB[v${index}]`);
      if (a) graph.push(`[${prefix}a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a${index}]`);
      else if (audio) graph.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${editedDuration(recipe)},asetpts=PTS-STARTPTS[a${index}]`);
      return;
    }
    ranges.forEach((range, r) => {
      const trim = `start=${range.start - recipe.start}:end=${range.end - recipe.start}`;
      if (v) graph.push(`[${index}:V:0]trim=${trim},setpts=PTS-STARTPTS[c${index}r${r}v]`);
      if (a) graph.push(`[${index}:a:0]atrim=${trim},asetpts=PTS-STARTPTS[c${index}r${r}a]`);
    });
    const stream = (type: string) => ranges.length === 1 ? `c${index}r0${type}` : `c${index}cut${type}`;
    if (ranges.length > 1 && (v || a)) graph.push(`${ranges.map((_, r) => `${v ? `[c${index}r${r}v]` : ''}${a ? `[c${index}r${r}a]` : ''}`).join('')}concat=n=${ranges.length}:v=${v ? 1 : 0}:a=${a ? 1 : 0}${v ? `[${stream('v')}]` : ''}${a ? `[${stream('a')}]` : ''}`);
    if (v) graph.push(`[${stream('v')}]${[...videoFilters(source, recipe, resources[index]), `scale=${asset.width}:${asset.height}:force_original_aspect_ratio=decrease`, `pad=${asset.width}:${asset.height}:(ow-iw)/2:(oh-ih)/2`, 'setsar=1', 'fps=30', 'format=yuv420p', `trim=duration=${editedDuration(recipe)}`, 'settb=AVTB'].join(',')}[v${index}]`);
    if (a) graph.push(`[${stream('a')}]${[...audioFilters(recipe, source), 'aresample=48000', 'aformat=sample_fmts=fltp:channel_layouts=stereo'].join(',')}[a${index}]`);
    else if (audio) graph.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${editedDuration(recipe)},asetpts=PTS-STARTPTS[a${index}]`);
  });
  const artwork = format.kind === 'audio' && format.artwork && settings.includeArtwork && (!!clips[0].edit.customArtwork || clips[0].asset.artworkIndex !== undefined);
  if (artwork) args.push('-i', clips[0].edit.customArtwork ? resources[0].artwork : inputs[0]);
  const captions = video && subtitleCodec(settings.format) && mergedCues(clips, transition).length > 0;
  if (captions) args.push('-i', captionPath);
  const chapters = settings.includeChapters && chapterFormats.includes(settings.format), chapterInput = clips.length + Number(artwork) + Number(captions);
  if (chapters) args.push('-f', 'ffmetadata', '-i', chapterPath);
  let firstLayerInput = chapterInput + Number(!!chapters);
  if (audio) clips.forEach((clip, index) => {
    if (!clip.edit.audioLayers?.length) return;
    const layers = mixes[index];
    if (!layers || layers.length !== clip.edit.audioLayers.length || layers.some((item, i) => item.layer.id !== clip.edit.audioLayers![i].id)) throw new Error('Restore all audio track sources before merging.');
    for (const layer of layers) args.push('-i', layer.path);
    for (let g = 0; g < graph.length; g++) graph[g] = graph[g].replaceAll(`[a${index}]`, `[mixbase${index}]`);
    const mix = audioMixGraph(clip.edit, layers, firstLayerInput, `[mixbase${index}]`, `c${index}mix`);
    graph.push(...mix.graph, `${mix.output}anull[a${index}]`); firstLayerInput += layers.length;
  });
  if (transition.type === 'fade') {
    let elapsed = editedDuration(clips[0].edit); let v = 'v0'; let a = 'a0';
    for (let i = 1; i < clips.length; i++) {
      const nextV = i === clips.length - 1 ? 'mergedv' : `blend${i}v`; const nextA = i === clips.length - 1 ? 'mergeda' : `blend${i}a`;
      if (video) graph.push(`[${v}][v${i}]xfade=transition=fade:duration=${transition.duration}:offset=${elapsed - transition.duration}[${nextV}]`);
      if (audio) graph.push(`[${a}][a${i}]acrossfade=d=${transition.duration}:c1=tri:c2=tri[${nextA}]`);
      elapsed += editedDuration(clips[i].edit) - transition.duration; v = nextV; a = nextA;
    }
  } else {
  graph.push(`${clips.map((_, i) => `${video ? `[v${i}]` : ''}${audio ? `[a${i}]` : ''}`).join('')}concat=n=${clips.length}:v=${video ? 1 : 0}:a=${audio ? 1 : 0}${video ? '[mergedv]' : ''}${audio ? '[mergeda]' : ''}`);
  }
  if (edit.format === 'gif') {
    graph.push(`[mergedv]${gifPaletteFilters(edit, 'mergedgif').join(',')}[gif]`); args.push('-map', '[gif]', '-an', '-loop', String(edit.gifLoop));
  } else {
    if (video) {
      args.push('-map', '[mergedv]', '-c:v', format.videoCodec!, '-pix_fmt', 'yuv420p');
      if (edit.videoBitrate) args.push('-b:v', `${edit.videoBitrate}k`);
      else { args.push('-crf', String({ high: 18, balanced: 23, small: 30 }[edit.quality])); if (edit.format === 'webm') args.push('-b:v', '0'); }
      if (format.videoCodec === 'libx264') args.push('-preset', 'fast');
      if (edit.format === 'webm') args.push('-deadline', 'good', '-cpu-used', '4');
    }
    if (audio) { args.push('-map', '[mergeda]', '-c:a', outputAudioCodec(edit)); if (!['wav', 'flac'].includes(edit.format)) args.push('-b:a', `${edit.audioBitrate}k`); }
  }
  if (artwork) { args.push('-map', clips[0].edit.customArtwork ? `${clips.length}:v:0` : `${clips.length}:${clips[0].asset.artworkIndex}`, '-c:v', 'mjpeg', '-disposition:v:0', 'attached_pic'); if (settings.format === 'mp3') args.push('-id3v2_version', '3'); }
  if (captions) args.push('-map', `${clips.length + (artwork ? 1 : 0)}:s:0`, '-c:s', subtitleCodec(settings.format)!);
  if (audio) args.push(...audioOutputArgs(edit));
  args.push('-filter_complex', graph.join(';'), '-map_metadata', edit.keepMetadata ? '0' : '-1', '-map_chapters', chapters ? String(chapterInput) : '-1');
  args.push(...mediaTagArgs(edit.outputTags));
  if (['mp4', 'mov', 'm4a'].includes(edit.format)) args.push('-movflags', '+faststart');
  args.push('-t', String(asset.duration), '-threads', '2', destination); return args;
}

export function mergedCues(clips: MediaClip[], transition: TransitionSettings = defaultTransition): SubtitleCue[] {
  let offset = 0; const cues: SubtitleCue[] = [];
  for (const clip of clips) {
    cues.push(...embeddedCues(clip.edit).map(c => ({ ...c, start: c.start + offset, end: c.end + offset })));
    offset += editedDuration(clip.edit) - (transition.type === 'fade' ? transition.duration : 0);
  }
  return cues.sort((a, b) => a.start - b.start);
}
