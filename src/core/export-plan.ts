import { parseEffectRanges } from './timed-adjustments';
import { parseClipSource } from './clip-source';
import { parseEffectInstances } from './effect-instance-validation';
import { allAudioLayers, captionLimit, effectiveSpeed, extraInstances } from './effect-instances';
import { parseSilence, defaultSilence } from './silence';
import { parseAddedEffects } from './effect-ids';
import { parseCoverArtwork } from './cover-art';
import { mediaTagArgs, parseTagOverrides } from './media-tags';
import { chapterFormats, timelineChapters } from './chapters';
import {
  parseAudioLayers,
  audioMixGraph,
  hasEditedAudio,
  type AudioLayerInput,
} from './audio-layers';
import { parseLegacyChapterPoints } from './legacy-chapters';
import { gifPaletteFilters, gifMappingArgs, validateGifOutput, type GifPass } from './gif-output';
import { audioOutputArgs, outputAudioCodec, validateAudioOutput } from './audio-output';
import { clipEffectKeys, clipRecipe } from './clips';
import { hasMinimumDuration, minimumSection, timeEpsilon } from './time-range';
import { clipFilterGraph } from './clip-filters';
import { parseAcceleration } from './hardware';
import { validateSizeTarget, resolveSizeTarget } from './size';
import { parseColor } from './color';
import { frameDimensions, parseGeometry } from './geometry';
import { parseOverlays } from './overlays';
import {
  resourcePaths,
  embeddedCues,
  embeddedCaptionPath,
  type RecipeResources,
} from './resources';
import { parseSubtitles, subtitleCodec } from './subtitles';
import { validateAudioEffects } from './audio-effects';
import { audioFilters, videoFilters as recipeVideoFilters } from './filters';
import { getFormat } from './formats';
import { editedDuration, keptRanges } from './timeline';
import type { EditSettings, MediaAsset } from './types';

export function validateEdit(asset: MediaAsset, edit: EditSettings, joinedFragment = false): void {
  parseEffectRanges(edit.effectRanges);
  parseAddedEffects(edit.addedEffects);
  parseEffectInstances(edit.effectInstances, asset, (recipe) => validateEdit(asset, recipe));
  parseSubtitles(edit.subtitles);
  if (
    edit.subtitles.cues.length +
      extraInstances(edit, 'captions').reduce(
        (sum, instance) => sum + (instance.settings.subtitles?.cues.length ?? 0),
        0,
      ) >
    captionLimit
  )
    throw new Error('Use up to 1,000 captions per source.');
  parseSilence(edit.silenceOptions ?? defaultSilence);
  if (edit.audioDucking !== undefined && typeof edit.audioDucking !== 'boolean')
    throw new Error('Invalid music ducking setting.');
  parseAudioLayers(allAudioLayers(edit));
  if (edit.audioMixProtectPeaks !== undefined && typeof edit.audioMixProtectPeaks !== 'boolean')
    throw new Error('Invalid audio mix protection setting.');
  if (edit.includeChapters !== undefined && typeof edit.includeChapters !== 'boolean')
    throw new Error('Invalid chapter setting.');
  parseTagOverrides(edit.outputTags);
  parseCoverArtwork(edit.customArtwork);
  parseLegacyChapterPoints(edit.markers, asset.duration);
  validateGifOutput(edit);
  validateAudioOutput(edit);
  parseAcceleration(edit.acceleration);
  validateSizeTarget(edit.targetSizeMb);
  parseColor(edit.color);
  parseGeometry(edit.geometry);
  parseOverlays(edit.overlays);
  validateAudioEffects(edit);
  parseSubtitles(edit.subtitles);
  if (
    getFormat(edit.format).kind === 'video' &&
    embeddedCues(edit).length &&
    !subtitleCodec(edit.format)
  )
    throw new Error('This format cannot embed subtitles. Choose burn-in or another video format.');
  if (edit.clips) {
    if (
      !Array.isArray(edit.clips) ||
      !edit.clips.length ||
      edit.clips.length > 1000 ||
      new Set(edit.clips.map((clip) => clip.id)).size !== edit.clips.length
    )
      throw new Error('Invalid ordered clips.');
    for (const clip of edit.clips) {
      if (
        !clip ||
        typeof clip.id !== 'string' ||
        !clip.id ||
        clip.id.length > 120 ||
        !clip.effects ||
        Object.keys(clip.effects).some(
          (key) => !clipEffectKeys.includes(key as (typeof clipEffectKeys)[number]),
        )
      )
        throw new Error('Invalid clip effects.');
      if (clip.start < edit.start || clip.end > edit.end)
        throw new Error('Clip lies outside the source selection.');
      parseClipSource(clip.source, asset.duration, clip);
      validateEdit(
        { ...asset, hasAudio: hasEditedAudio(asset, edit) },
        clipRecipe(edit, clip),
        !!clip.groupId,
      );
    }
    const completed = new Set<string>();
    edit.clips.forEach((clip, index) => {
      if (clip.groupId === undefined) return;
      if (typeof clip.groupId !== 'string' || !clip.groupId.trim() || clip.groupId.length > 120)
        throw new Error('Invalid joined section.');
      if (
        clip.joinedRanges !== undefined &&
        (!Array.isArray(clip.joinedRanges) ||
          !clip.joinedRanges.length ||
          clip.joinedRanges.length > 1000 ||
          clip.joinedRanges.some(
            (range, i, ranges) =>
              !Number.isFinite(range.start) ||
              !Number.isFinite(range.end) ||
              range.start < 0 ||
              range.end > asset.duration + 0.05 ||
              range.end <= range.start ||
              (i > 0 && range.start < ranges[i - 1].end),
          ) ||
          !clip.joinedRanges.some((range) => clip.start >= range.start && clip.end <= range.end))
      )
        throw new Error('Invalid joined restore ranges.');
      const previous = edit.clips![index - 1];
      if (previous?.groupId !== clip.groupId) {
        if (completed.has(clip.groupId)) throw new Error('Joined pieces must stay together.');
        completed.add(clip.groupId);
      } else if (
        clip.start < previous.end - timeEpsilon ||
        effectiveSpeed(clipRecipe(edit, clip)) !== effectiveSpeed(clipRecipe(edit, previous)) ||
        JSON.stringify(clip.joinedRanges) !== JSON.stringify(previous.joinedRanges)
      )
        throw new Error('Invalid joined section timing.');
    });
    for (const group of completed)
      if (
        edit.clips
          .filter((clip) => clip.groupId === group)
          .reduce(
            (sum, clip) => sum + (clip.end - clip.start) / effectiveSpeed(clipRecipe(edit, clip)),
            0,
          ) +
          timeEpsilon <
        minimumSection
      )
        throw new Error('Keep at least 0.05 seconds of joined media.');
  }
  const format = getFormat(edit.format);
  if (![edit.start, edit.end, edit.volume, edit.audioBitrate, edit.fps].every(Number.isFinite))
    throw new Error('Enter valid numeric settings.');
  if (
    edit.start < 0 ||
    edit.end > asset.duration + 0.05 ||
    !(joinedFragment ? edit.end > edit.start : hasMinimumDuration(edit))
  )
    throw new Error('Choose a trim range of at least 0.05 seconds within the media.');
  if (
    !Array.isArray(edit.cuts) ||
    !Array.isArray(edit.splits) ||
    edit.cuts.some(
      (c) =>
        !Number.isFinite(c.start) ||
        !Number.isFinite(c.end) ||
        c.start < 0 ||
        c.end <= c.start ||
        c.end > asset.duration + 0.05,
    ) ||
    edit.splits.some((s) => !Number.isFinite(s) || s < 0 || s > asset.duration)
  )
    throw new Error('Invalid timeline sections.');
  if (!joinedFragment && editedDuration(edit) + timeEpsilon < minimumSection)
    throw new Error('Keep at least 0.05 seconds of media.');
  if (
    !Number.isFinite(edit.speed) ||
    edit.speed < 0.25 ||
    edit.speed > 4 ||
    typeof edit.preservePitch !== 'boolean'
  )
    throw new Error('Playback speed must be between 0.25× and 4×.');
  if (
    [edit.audioFadeIn, edit.audioFadeOut, edit.videoFadeIn, edit.videoFadeOut].some(
      (d) => !Number.isFinite(d) || d < 0 || d > editedDuration(edit),
    )
  )
    throw new Error('Fade duration must fit within the edited output.');
  if (edit.volume < 0 || edit.volume > 3) throw new Error('Volume must be between 0% and 300%.');
  if (edit.audioBitrate < 32 || edit.audioBitrate > 320)
    throw new Error('Audio bitrate must be between 32 and 320 kbps.');
  if (
    edit.videoBitrate !== null &&
    (!Number.isFinite(edit.videoBitrate) || edit.videoBitrate < 100 || edit.videoBitrate > 100000)
  )
    throw new Error('Video bitrate must be between 100 and 100,000 kbps.');
  if (edit.fps < 1 || edit.fps > 60)
    throw new Error('GIF frame rate must be between 1 and 60 fps.');
  if (!['high', 'balanced', 'small'].includes(edit.quality))
    throw new Error('Choose a valid quality preset.');
  if (format.kind === 'video' && asset.kind !== 'video')
    throw new Error('Audio cannot be exported as video.');
  if (format.kind === 'audio' && !hasEditedAudio(asset, edit))
    throw new Error('This file has no audio to extract.');
  let dimensions = frameDimensions(asset, { ...edit, effectInstances: undefined });
  for (const instance of edit.effectInstances ?? []) {
    const crop = instance.effect === 'crop' ? instance.settings.crop : null;
    if (
      crop &&
      (crop.x + crop.width > dimensions.width || crop.y + crop.height > dimensions.height)
    )
      throw new Error('Each crop must fit inside the picture produced by the preceding effects.');
    if (crop) dimensions = { width: crop.width, height: crop.height };
    const geometry = instance.effect === 'transform' ? instance.settings.geometry : undefined;
    if (geometry?.rotation && geometry.rotation % 180)
      dimensions = { width: dimensions.height, height: dimensions.width };
    if (geometry?.resize) dimensions = geometry.resize;
  }
  const speed = effectiveSpeed(edit);
  if (speed < 0.0625 || speed > 16)
    throw new Error('Combined speed must be between 0.0625× and 16×.');
  const c = edit.crop;
  if (
    c &&
    (!asset.width ||
      !asset.height ||
      ![c.x, c.y, c.width, c.height].every(Number.isInteger) ||
      c.x < 0 ||
      c.y < 0 ||
      c.width < 2 ||
      c.height < 2 ||
      c.x + c.width > asset.width ||
      c.y + c.height > asset.height)
  )
    throw new Error('The crop must fit inside the source frame and be at least 2 × 2 pixels.');
}

/** Pure argument planning shared by native FFmpeg and WebAssembly. Never uses shell strings. */
export function buildExportArgs(
  asset: MediaAsset,
  edit: EditSettings,
  input: string,
  output: string,
  resources: RecipeResources = resourcePaths(),
  layers: AudioLayerInput[] = [],
  gifPass?: GifPass,
): string[] {
  validateEdit(asset, edit);
  edit = resolveSizeTarget(asset, {
    ...edit,
    audioLayers: allAudioLayers(edit),
    effectInstances: edit.effectInstances?.filter((instance) => instance.effect !== 'mix'),
  });
  const format = getFormat(edit.format);
  const mixing = !!edit.audioLayers?.length && edit.format !== 'gif';
  if (
    mixing &&
    (layers.length !== edit.audioLayers!.length ||
      layers.some((item, i) => item.layer.id !== edit.audioLayers![i].id))
  )
    throw new Error('Restore all audio track sources before exporting.');
  const baseEdit = mixing
    ? {
        ...edit,
        audioFadeIn: 0,
        audioFadeOut: 0,
        effectInstances: edit.effectInstances?.filter(
          (instance) => !instance.effect.startsWith('audioFade'),
        ),
      }
    : edit;
  const artwork =
    format.kind === 'audio' &&
    edit.includeArtwork &&
    format.artwork &&
    (!!edit.customArtwork || asset.artworkIndex !== undefined);
  // Limit decoding to the source selection, including palette generation for GIF.
  const args = ['-y', '-ss', String(edit.start), '-t', String(edit.end - edit.start), '-i', input];
  // An unseeked second input keeps the single artwork packet when audio is trimmed.
  if (artwork) args.push('-i', edit.customArtwork ? resources.artwork : input);
  const captions = format.kind === 'video' && embeddedCues(edit).length > 0;
  if (captions) args.push('-i', embeddedCaptionPath(edit, resources));
  const chapters =
    edit.includeChapters &&
    chapterFormats.includes(edit.format) &&
    timelineChapters(edit).length > 0;
  const chapterInput = 1 + Number(artwork) + Number(captions);
  if (chapters) args.push('-f', 'ffmetadata', '-i', resources.chapters);
  const firstLayerInput = chapterInput + Number(!!chapters);
  if (mixing) for (const layer of layers) args.push('-i', layer.path);
  if (gifPass?.kind === 'encode') args.push('-i', gifPass.path);
  args.push(
    '-t',
    String(editedDuration(edit)),
    '-map_metadata',
    edit.keepMetadata ? '0' : '-1',
    '-map_chapters',
    chapters ? String(chapterInput) : '-1',
  );
  args.push(...mediaTagArgs(edit.outputTags));
  args.push('-filter_threads', '2', '-filter_complex_threads', '1');
  const videoFilters = format.kind === 'video' ? recipeVideoFilters(asset, edit, resources) : [];
  if (format.kind === 'video' && edit.format !== 'gif')
    videoFilters.push('scale=trunc(iw/2)*2:trunc(ih/2)*2');
  const hasVideo = format.kind === 'video';
  const sourceAudio = asset.hasAudio && edit.format !== 'gif';
  const hasAudio = hasEditedAudio(asset, edit) && edit.format !== 'gif';
  const ranges = keptRanges(edit);
  const complex =
    !!edit.clips || ranges.length > 1 || (ranges.length === 1 && ranges[0].start !== edit.start);
  let videoInput = '0:V:0';
  let audioInput = '0:a:0';
  let graph: string[] = [];
  if (edit.clips && (hasVideo || sourceAudio)) {
    const clips = clipFilterGraph(
      asset,
      baseEdit,
      '0',
      'ordered',
      resources,
      hasVideo,
      sourceAudio,
    );
    graph = clips.graph;
    videoInput = '[orderedv]';
    audioInput = '[ordereda]';
  } else if (complex && (hasVideo || sourceAudio)) {
    ranges.forEach((range, i) => {
      const trim = `start=${range.start - edit.start}:end=${range.end - edit.start}`;
      if (hasVideo) graph.push(`[0:V:0]trim=${trim},setpts=PTS-STARTPTS[v${i}]`);
      if (sourceAudio) graph.push(`[0:a:0]atrim=${trim},asetpts=PTS-STARTPTS[a${i}]`);
    });
    const inputs = ranges
      .map((_, i) => `${hasVideo ? `[v${i}]` : ''}${sourceAudio ? `[a${i}]` : ''}`)
      .join('');
    graph.push(
      `${inputs}concat=n=${ranges.length}:v=${hasVideo ? 1 : 0}:a=${sourceAudio ? 1 : 0}${hasVideo ? '[joinedv]' : ''}${sourceAudio ? '[joineda]' : ''}`,
    );
    videoInput = '[joinedv]';
    audioInput = '[joineda]';
    if (hasVideo && videoFilters.length) {
      graph.push(`[joinedv]${videoFilters.join(',')}[editedv]`);
      videoInput = '[editedv]';
    }
    if (sourceAudio) {
      graph.push(`[joineda]${audioFilters(baseEdit, asset).join(',')}[editeda]`);
      audioInput = '[editeda]';
    }
  }
  if (mixing) {
    let base: string | null = null;
    if (sourceAudio) {
      if (complex) base = audioInput;
      else {
        graph.push(`[0:a:0]${audioFilters(baseEdit, asset).join(',')}[mixbase]`);
        base = '[mixbase]';
      }
    }
    const mix = audioMixGraph(edit, layers, firstLayerInput, base);
    graph.push(...mix.graph);
    audioInput = mix.output;
  }
  if (edit.format === 'gif') {
    const prefix = complex ? videoInput : '[0:V:0]';
    const filters = [
      ...(complex ? [] : videoFilters),
      ...gifPaletteFilters(
        edit,
        'gif',
        gifPass?.kind === 'palette'
          ? 'palette'
          : gifPass?.kind === 'encode'
            ? firstLayerInput
            : undefined,
      ),
    ];
    graph.push(`${prefix}${filters.join(',')}[gif]`);
    args.push(...gifMappingArgs(edit, gifPass));
  } else if (hasVideo) {
    args.push('-map', videoInput);
    if (hasAudio) args.push('-map', complex || mixing ? audioInput : '0:a:0?');
    args.push('-c:v', format.videoCodec!, '-pix_fmt', 'yuv420p');
    if (!complex) args.push('-vf', videoFilters.join(','));
    if (edit.videoBitrate) args.push('-b:v', `${edit.videoBitrate}k`);
    else {
      args.push('-crf', String({ high: 18, balanced: 23, small: 30 }[edit.quality]));
      if (edit.format === 'webm') args.push('-b:v', '0');
    }
    if (format.videoCodec === 'libx264') args.push('-preset', 'fast');
    if (edit.format === 'webm') args.push('-deadline', 'good', '-cpu-used', '4');
    if (hasAudio) args.push('-c:a', outputAudioCodec(edit), '-b:a', `${edit.audioBitrate}k`);
  } else {
    args.push('-map', audioInput, '-c:a', outputAudioCodec(edit));
    if (!['wav', 'flac'].includes(edit.format)) args.push('-b:a', `${edit.audioBitrate}k`);
    if (artwork) {
      args.push(
        '-map',
        edit.customArtwork ? '1:v:0' : `1:${asset.artworkIndex}`,
        '-c:v',
        'mjpeg',
        '-disposition:v:0',
        'attached_pic',
      );
      if (edit.format === 'mp3') args.push('-id3v2_version', '3');
    } else args.push('-vn');
  }
  if (captions)
    args.push(
      '-map',
      `${artwork ? 2 : 1}:s:0`,
      '-c:s',
      subtitleCodec(edit.format)!,
      '-metadata:s:s:0',
      'language=und',
    );
  if (graph.length) args.push('-filter_complex', graph.join(';'));
  if (hasAudio) args.push(...audioOutputArgs(edit));
  if (hasAudio && !complex && !mixing) args.push('-af', audioFilters(baseEdit, asset).join(','));
  if (['mp4', 'mov', 'm4a'].includes(edit.format)) args.push('-movflags', '+faststart');
  args.push('-threads', '2', output);
  return args;
}
export function outputName(name: string, format: string): string {
  return `${name.replace(/\.[^.]+$/, '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') || 'media'}-edited.${format}`;
}
