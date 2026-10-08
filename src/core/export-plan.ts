import { parseGeometry } from './geometry';
import { parseOverlays } from './overlays';
import { resourcePaths, type RecipeResources } from './resources';
import { parseSubtitles, outputCues, subtitleCodec } from './subtitles';
import { validateAudioEffects } from './audio-effects';
import { audioFilters, videoFilters as recipeVideoFilters } from './filters';
import { getFormat } from './formats';
import { editedDuration, keptRanges } from './timeline';
import type { EditSettings, MediaAsset } from './types';

export function validateEdit(asset: MediaAsset, edit: EditSettings): void {
  parseGeometry(edit.geometry); parseOverlays(edit.overlays); validateAudioEffects(edit); parseSubtitles(edit.subtitles);
  if (getFormat(edit.format).kind === 'video' && edit.subtitles.mode === 'embed' && edit.subtitles.cues.length && !subtitleCodec(edit.format)) throw new Error('This format cannot embed subtitles. Choose burn-in or another video format.');
  const format = getFormat(edit.format);
  if (![edit.start, edit.end, edit.volume, edit.audioBitrate, edit.fps].every(Number.isFinite)) throw new Error('Enter valid numeric settings.');
  if (edit.start < 0 || edit.end > asset.duration + 0.05 || edit.end - edit.start < 0.05) throw new Error('Choose a trim range of at least 0.05 seconds within the media.');
  if (!Array.isArray(edit.cuts) || !Array.isArray(edit.splits) || edit.cuts.some(c => !Number.isFinite(c.start) || !Number.isFinite(c.end) || c.start < 0 || c.end <= c.start || c.end > asset.duration + 0.05) || edit.splits.some(s => !Number.isFinite(s) || s < 0 || s > asset.duration)) throw new Error('Invalid timeline sections.');
  if (editedDuration(edit) < 0.05) throw new Error('Keep at least 0.05 seconds of media.');
  if (!Number.isFinite(edit.speed) || edit.speed < 0.25 || edit.speed > 4 || typeof edit.preservePitch !== 'boolean') throw new Error('Playback speed must be between 0.25× and 4×.');
  if ([edit.audioFadeIn, edit.audioFadeOut, edit.videoFadeIn, edit.videoFadeOut].some(d => !Number.isFinite(d) || d < 0 || d > editedDuration(edit))) throw new Error('Fade duration must fit within the edited output.');
  if (edit.volume < 0 || edit.volume > 3) throw new Error('Volume must be between 0% and 300%.');
  if (edit.audioBitrate < 32 || edit.audioBitrate > 320) throw new Error('Audio bitrate must be between 32 and 320 kbps.');
  if (edit.videoBitrate !== null && (!Number.isFinite(edit.videoBitrate) || edit.videoBitrate < 100 || edit.videoBitrate > 100000)) throw new Error('Video bitrate must be between 100 and 100,000 kbps.');
  if (edit.fps < 1 || edit.fps > 60) throw new Error('GIF frame rate must be between 1 and 60 fps.');
  if (!['high', 'balanced', 'small'].includes(edit.quality)) throw new Error('Choose a valid quality preset.');
  if (format.kind === 'video' && asset.kind !== 'video') throw new Error('Audio cannot be exported as video.');
  if (format.kind === 'audio' && !asset.hasAudio) throw new Error('This file has no audio to extract.');
  const c = edit.crop;
  if (c && (!asset.width || !asset.height || ![c.x, c.y, c.width, c.height].every(Number.isInteger) || c.x < 0 || c.y < 0 || c.width < 2 || c.height < 2 || c.x + c.width > asset.width || c.y + c.height > asset.height)) throw new Error('The crop must fit inside the source frame and be at least 2 × 2 pixels.');
}

/** Pure argument planning shared by native FFmpeg and WebAssembly. Never uses shell strings. */
export function buildExportArgs(asset: MediaAsset, edit: EditSettings, input: string, output: string, resources: RecipeResources = resourcePaths()): string[] {
  validateEdit(asset, edit);
  const format = getFormat(edit.format);
  const artwork = format.kind === 'audio' && edit.includeArtwork && format.artwork && asset.artworkIndex !== undefined;
  // Limit decoding to the source selection, including palette generation for GIF.
  const args = ['-y', '-ss', String(edit.start), '-t', String(edit.end - edit.start), '-i', input];
  // An unseeked second input keeps the single artwork packet when audio is trimmed.
  if (artwork) args.push('-i', input);
  const captions = format.kind === 'video' && edit.subtitles.mode === 'embed' && outputCues(edit).length > 0;
  if (captions) args.push('-i', resources.captions);
  args.push('-t', String(editedDuration(edit)), '-map_metadata', edit.keepMetadata ? '0' : '-1');
  args.push('-filter_threads', '2', '-filter_complex_threads', '1');
  const videoFilters = format.kind === 'video' ? recipeVideoFilters(asset, edit, resources) : [];
  if (format.kind === 'video' && edit.format !== 'gif') videoFilters.push('scale=trunc(iw/2)*2:trunc(ih/2)*2');
  const hasVideo = format.kind === 'video';
  const hasAudio = asset.hasAudio && edit.format !== 'gif';
  const ranges = keptRanges(edit);
  const complex = ranges.length > 1 || (ranges.length === 1 && ranges[0].start !== edit.start);
  let videoInput = '0:V:0'; let audioInput = '0:a:0';
  let graph: string[] = [];
  if (complex) {
    ranges.forEach((range, i) => {
      const trim = `start=${range.start - edit.start}:end=${range.end - edit.start}`;
      if (hasVideo) graph.push(`[0:V:0]trim=${trim},setpts=PTS-STARTPTS[v${i}]`);
      if (hasAudio) graph.push(`[0:a:0]atrim=${trim},asetpts=PTS-STARTPTS[a${i}]`);
    });
    const inputs = ranges.map((_, i) => `${hasVideo ? `[v${i}]` : ''}${hasAudio ? `[a${i}]` : ''}`).join('');
    graph.push(`${inputs}concat=n=${ranges.length}:v=${hasVideo ? 1 : 0}:a=${hasAudio ? 1 : 0}${hasVideo ? '[joinedv]' : ''}${hasAudio ? '[joineda]' : ''}`);
    videoInput = '[joinedv]'; audioInput = '[joineda]';
    if (hasVideo && videoFilters.length) { graph.push(`[joinedv]${videoFilters.join(',')}[editedv]`); videoInput = '[editedv]'; }
    if (hasAudio) { graph.push(`[joineda]${audioFilters(edit, asset).join(',')}[editeda]`); audioInput = '[editeda]'; }
  }
  if (edit.format === 'gif') {
    const prefix = complex ? videoInput : '[0:V:0]';
    const filters = [...(complex ? [] : videoFilters), `fps=${edit.fps}`, 'split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a'];
    graph.push(`${prefix}${filters.join(',')}[gif]`);
    args.push('-map', '[gif]', '-an', '-loop', '0');
  } else if (hasVideo) {
    args.push('-map', videoInput);
    if (hasAudio) args.push('-map', complex ? audioInput : '0:a:0?');
    args.push('-c:v', format.videoCodec!, '-pix_fmt', 'yuv420p');
    if (!complex) args.push('-vf', videoFilters.join(','));
    if (edit.videoBitrate) args.push('-b:v', `${edit.videoBitrate}k`);
    else {
      args.push('-crf', String({ high: 18, balanced: 23, small: 30 }[edit.quality]));
      if (edit.format === 'webm') args.push('-b:v', '0');
    }
    if (format.videoCodec === 'libx264') args.push('-preset', 'fast');
    if (edit.format === 'webm') args.push('-deadline', 'good', '-cpu-used', '4');
    if (hasAudio) args.push('-c:a', format.audioCodec!, '-b:a', `${edit.audioBitrate}k`);
  } else {
    args.push('-map', audioInput, '-c:a', format.audioCodec!);
    if (!['wav', 'flac'].includes(edit.format)) args.push('-b:a', `${edit.audioBitrate}k`);
    if (artwork) {
      args.push('-map', `1:${asset.artworkIndex}`, '-c:v', 'mjpeg', '-disposition:v:0', 'attached_pic');
      if (edit.format === 'mp3') args.push('-id3v2_version', '3');
    } else args.push('-vn');
  }
  if (captions) args.push('-map', `${artwork ? 2 : 1}:s:0`, '-c:s', subtitleCodec(edit.format)!, '-metadata:s:s:0', 'language=und');
  if (graph.length) args.push('-filter_complex', graph.join(';'));
  if (hasAudio && !complex) args.push('-af', audioFilters(edit, asset).join(','));
  if (['mp4', 'mov', 'm4a'].includes(edit.format)) args.push('-movflags', '+faststart');
  args.push('-threads', '2', output);
  return args;
}
export function outputName(name: string, format: string): string {
  return `${name.replace(/\.[^.]+$/, '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') || 'media'}-edited.${format}`;
}
