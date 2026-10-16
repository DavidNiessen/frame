import { browserInputs } from './browser-inputs';
import { analysisDataArgs } from '../core/analysis-data';
import { resolveAudioLayers } from '../core/audio-layers';
import { mountBrowserLayers } from './browser-audio-layers';
import type { MediaAsset } from '../core/types';
import { loudnessArgs, LoudnessCollector } from '../core/loudness';
import { sceneArgs, SceneCollector } from '../core/scenes';
import { contactSheetArgs } from '../core/contact-sheet';
import { silenceArgs, SilenceCollector } from '../core/silence';
import type { FFmpeg } from '@ffmpeg/ffmpeg';
import { browserResources } from './browser-resources';
import { framePreviewArgs } from '../core/frame-preview';
import { previewAudioArgs } from '../core/audio-preview';
import { waveformArgs, WaveformCollector } from '../core/waveform';
import type { MediaEngine } from '../core/types';
export function browserAnalysis(
  ready: () => Promise<FFmpeg>,
  files: Map<string, File>,
  sources: Map<string, MediaAsset> = new Map(),
): Pick<
  MediaEngine,
  | 'analysisData'
  | 'detectSilence'
  | 'previewFrame'
  | 'previewAudio'
  | 'waveform'
  | 'contactSheet'
  | 'detectScenes'
  | 'measureLoudness'
> {
  return {
    async analysisData(asset, edit, options, onProgress) {
      const source = files.get(asset.id);
      if (!source) throw new Error('Import the source again.');
      const ff = await ready(),
        output = options.kind === 'speech' ? 'speech.wav' : 'frames.raw';

      const resources = await browserResources(ff, [edit], [asset], files, sources);
      const layers =
        options.kind === 'speech'
          ? resolveAudioLayers(
              edit,
              [...sources.values()].map((asset) => ({ asset, path: `layer-${asset.id}` })),
            )
          : [];
      const update = ({ time }: { time: number }) =>
        onProgress({
          ratio: Math.min(0.99, time / 1e6 / (options.end - options.start)),
          message:
            options.kind === 'speech' ? 'Preparing speech audio…' : 'Preparing tracking frames…',
        });
      ff.on('progress', update);
      const inputs = browserInputs(ff);
      try {
        const input = await inputs.open(source);
        await mountBrowserLayers(layers, files, sources, inputs);
        if (
          (await ff.exec(
            analysisDataArgs(asset, edit, options, input, output, resources.paths[0], layers),
          )) !== 0
        )
          throw new Error('Could not prepare this analysis.');
        const bytes = await ff.readFile(output);
        if (typeof bytes === 'string') throw new Error('Invalid analysis output.');
        return new Uint8Array(bytes);
      } finally {
        ff.off('progress', update);
        await resources.cleanup();
        await inputs.cleanup();
        await ff.deleteFile(output).catch(() => {});
      }
    },
    async detectSilence(asset, options, onProgress) {
      const file = files.get(asset.id);
      if (!file) throw new Error('Import the source again.');
      const ff = await ready();

      const collector = new SilenceCollector();
      const log = ({ message }: { message: string }) => collector.push(message);
      const progress = ({ time }: { time: number }) =>
        onProgress({
          ratio: Math.min(1, time / 1e6 / asset.duration),
          message: 'Detecting silent sections…',
        });
      ff.on('log', log);
      ff.on('progress', progress);
      const inputs = browserInputs(ff);
      try {
        const input = await inputs.open(file);
        if ((await ff.exec(silenceArgs(asset, input, options))) !== 0)
          throw new Error('Could not detect silence.');
        return collector.finish(asset.duration);
      } finally {
        ff.off('log', log);
        ff.off('progress', progress);
        await inputs.cleanup();
      }
    },
    async previewFrame(asset, edit, time, onProgress) {
      const source = files.get(asset.id);
      if (!source) throw new Error('Import the source again.');
      const ff = await ready();
      const resources = await browserResources(ff, [edit], [asset], files, sources);
      const output = 'frame-preview.png';
      const inputs = browserInputs(ff);
      try {
        onProgress({ ratio: 0, message: 'Rendering edited frame…' });
        const input = await inputs.open(source);
        if (
          (await ff.exec(
            framePreviewArgs(asset, edit, time, input, output, resources.paths[0]),
          )) !== 0
        )
          throw new Error('Could not render this frame.');
        const data = await ff.readFile(output);
        if (typeof data === 'string') throw new Error('Invalid frame output.');
        return URL.createObjectURL(new Blob([new Uint8Array(data)], { type: 'image/png' }));
      } finally {
        await resources.cleanup();
        await inputs.cleanup();
        await ff.deleteFile(output).catch(() => {});
      }
    },
    async previewAudio(asset, edit, onProgress) {
      const source = files.get(asset.id);
      if (!source) throw new Error('Import the source file again.');
      const ff = await ready();
      const layers = resolveAudioLayers(
        edit,
        [...sources.values()].map((asset) => ({ asset, path: `layer-${asset.id}` })),
      );

      const output = `audio-preview-${asset.id}.wav`;
      const errors: string[] = [];
      const log = ({ message }: { message: string }) => {
        errors.push(message);
        if (errors.length > 15) errors.shift();
      };
      ff.on('log', log);
      const inputs = browserInputs(ff);
      try {
        onProgress({ ratio: 0, message: 'Preparing audio effects preview…' });
        const input = await inputs.open(source);
        await mountBrowserLayers(layers, files, sources, inputs);
        if ((await ff.exec(previewAudioArgs(asset, edit, input, output, layers))) !== 0)
          throw new Error(`Could not prepare the audio preview. ${errors.slice(-5).join(' ')}`);
        const data = await ff.readFile(output);
        if (typeof data === 'string') throw new Error('Invalid preview output.');
        return URL.createObjectURL(new Blob([new Uint8Array(data)], { type: 'audio/wav' }));
      } finally {
        ff.off('log', log);
        await inputs.cleanup();
        await ff.deleteFile(output).catch(() => {});
      }
    },
    async measureLoudness(asset, edit, onProgress) {
      const source = files.get(asset.id);
      if (!source) throw new Error('Import the source again.');
      const ff = await ready(),
        collector = new LoudnessCollector(),
        layers = resolveAudioLayers(
          edit,
          [...sources.values()].map((asset) => ({ asset, path: `layer-${asset.id}` })),
        );

      const log = ({ message }: { message: string }) => collector.push(message),
        progress = ({ time }: { time: number }) =>
          onProgress({
            ratio: Math.min(1, time / 1e6 / asset.duration),
            message: 'Measuring edited audio…',
          });
      ff.on('log', log);
      ff.on('progress', progress);
      const inputs = browserInputs(ff);
      try {
        const input = await inputs.open(source);
        await mountBrowserLayers(layers, files, sources, inputs);
        if ((await ff.exec(loudnessArgs(asset, edit, input, layers))) !== 0)
          throw new Error('Could not measure edited audio.');
        return collector.finish();
      } finally {
        ff.off('log', log);
        ff.off('progress', progress);
        await inputs.cleanup();
      }
    },
    async detectScenes(asset, options, onProgress) {
      const source = files.get(asset.id);
      if (!source) throw new Error('Import the source again.');
      const ff = await ready(),
        collector = new SceneCollector(options.minGap);

      const log = ({ message }: { message: string }) => collector.push(message),
        progress = ({ time }: { time: number }) =>
          onProgress({
            ratio: Math.min(1, time / 1e6 / asset.duration),
            message: 'Finding scene changes…',
          });
      ff.on('log', log);
      ff.on('progress', progress);
      const inputs = browserInputs(ff);
      try {
        const input = await inputs.open(source);
        if ((await ff.exec(sceneArgs(asset, input, options))) !== 0)
          throw new Error('Could not scan this video for scene changes.');
        return collector.finish(asset.duration);
      } finally {
        ff.off('log', log);
        ff.off('progress', progress);
        await inputs.cleanup();
      }
    },
    async contactSheet(asset, edit, options, onProgress) {
      const source = files.get(asset.id);
      if (!source) throw new Error('Import the source again.');
      const ff = await ready();
      const resources = await browserResources(ff, [edit], [asset], files, sources),
        output = `sheet-${asset.id}.png`;

      const progress = ({ time }: { time: number }) =>
        onProgress({
          ratio: Math.min(1, time / 1e6 / asset.duration),
          message: 'Building contact sheet…',
        });
      ff.on('progress', progress);
      const inputs = browserInputs(ff);
      try {
        const input = await inputs.open(source);
        if (
          (await ff.exec(
            contactSheetArgs(asset, edit, options, input, output, resources.paths[0]),
          )) !== 0
        )
          throw new Error('Could not build the contact sheet.');
        const data = await ff.readFile(output);
        if (typeof data === 'string') throw new Error('Invalid contact sheet.');
        return URL.createObjectURL(new Blob([new Uint8Array(data)], { type: 'image/png' }));
      } finally {
        ff.off('progress', progress);
        await resources.cleanup();
        await inputs.cleanup();
        await ff.deleteFile(output).catch(() => {});
      }
    },
    async waveform(asset, onProgress) {
      const source = files.get(asset.id);
      if (!source) throw new Error('Import the source file again.');
      const ff = await ready();

      const collector = new WaveformCollector();
      const messages: string[] = [];
      const log = ({ message }: { message: string }) => {
        collector.push(message);
        messages.push(message);
        if (messages.length > 15) messages.shift();
      };
      const progress = ({ time }: { time: number }) =>
        onProgress({
          ratio: Math.min(1, time / 1e6 / asset.duration),
          message: 'Reading audio peaks…',
        });
      ff.on('log', log);
      ff.on('progress', progress);
      const inputs = browserInputs(ff);
      try {
        const input = await inputs.open(source);
        if ((await ff.exec(waveformArgs(asset, input))) !== 0 || !collector.points.length)
          throw new Error(
            `Could not read this file’s audio waveform. ${messages.slice(-5).join(' ')}`,
          );
        return collector.points;
      } finally {
        ff.off('log', log);
        ff.off('progress', progress);
        await inputs.cleanup();
      }
    },
  };
}
