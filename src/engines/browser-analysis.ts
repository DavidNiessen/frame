import type { FFmpeg } from '@ffmpeg/ffmpeg';
import { browserResources } from './browser-resources';
import { framePreviewArgs } from '../core/frame-preview';
import { previewAudioArgs } from '../core/audio-preview';
import { thumbnailArgs } from '../core/thumbnails';
import { waveformArgs, WaveformCollector } from '../core/waveform';
import type { MediaEngine } from '../core/types';
export function browserAnalysis(ready: () => Promise<FFmpeg>, files: Map<string, File>): Pick<MediaEngine, 'previewFrame' | 'previewAudio' | 'thumbnails' | 'waveform'> {
  return {
    async previewFrame(asset, edit, time, onProgress) {
      const source = files.get(asset.id); if (!source) throw new Error('Import the source again.'); const ff = await ready();
      const resources = await browserResources(ff, [edit], [asset]); const input = `frame-source-${asset.id}`, output = 'frame-preview.png';
      try {
        onProgress({ ratio: 0, message: 'Rendering edited frame…' }); await ff.writeFile(input, new Uint8Array(await source.arrayBuffer()));
        if (await ff.exec(framePreviewArgs(asset, edit, time, input, output, resources.paths[0])) !== 0) throw new Error('Could not render this frame.');
        const data = await ff.readFile(output); if (typeof data === 'string') throw new Error('Invalid frame output.');
        return URL.createObjectURL(new Blob([new Uint8Array(data)], { type: 'image/png' }));
      } finally { await resources.cleanup(); await ff.deleteFile(input).catch(() => {}); await ff.deleteFile(output).catch(() => {}); }
    },
    async previewAudio(asset, edit, onProgress) {
      const source = files.get(asset.id); if (!source) throw new Error('Import the source file again.');
      const ff = await ready(); const input = `audio-source-${asset.id}`; const output = `audio-preview-${asset.id}.wav`; const errors: string[] = [];
      const log = ({ message }: { message: string }) => { errors.push(message); if (errors.length > 15) errors.shift(); }; ff.on('log', log);
      try {
        onProgress({ ratio: 0, message: 'Preparing audio effects preview…' });
        await ff.writeFile(input, new Uint8Array(await source.arrayBuffer()));
        if (await ff.exec(previewAudioArgs(asset, edit, input, output)) !== 0) throw new Error(`Could not prepare the audio preview. ${errors.slice(-5).join(' ')}`);
        const data = await ff.readFile(output); if (typeof data === 'string') throw new Error('Invalid preview output.');
        return URL.createObjectURL(new Blob([new Uint8Array(data)], { type: 'audio/wav' }));
      } finally { ff.off('log', log); await ff.deleteFile(input).catch(() => {}); await ff.deleteFile(output).catch(() => {}); }
    },
    async thumbnails(asset, onProgress) {
      const source = files.get(asset.id); if (!source) throw new Error('Import the source file again.');
      const ff = await ready(); const input = `thumb-source-${asset.id}`; const output = `thumb-${asset.id}.png`;
      const progress = ({ time }: { time: number }) => onProgress({ ratio: Math.min(1, time / 1e6 / asset.duration), message: 'Reading video frames…' });
      ff.on('progress', progress);
      try {
        await ff.writeFile(input, new Uint8Array(await source.arrayBuffer()));
        if (await ff.exec(thumbnailArgs(asset, input, output)) !== 0) throw new Error('Could not generate video thumbnails.');
        const data = await ff.readFile(output); if (typeof data === 'string') throw new Error('Invalid thumbnail output.');
        return URL.createObjectURL(new Blob([new Uint8Array(data)], { type: 'image/png' }));
      } finally { ff.off('progress', progress); await ff.deleteFile(input).catch(() => {}); await ff.deleteFile(output).catch(() => {}); }
    },
    async waveform(asset, onProgress) {
      const source = files.get(asset.id); if (!source) throw new Error('Import the source file again.');
      const ff = await ready(); const input = `analysis-${asset.id}`; const collector = new WaveformCollector(); const messages: string[] = [];
      const log = ({ message }: { message: string }) => { collector.push(message); messages.push(message); if (messages.length > 15) messages.shift(); };
      const progress = ({ time }: { time: number }) => onProgress({ ratio: Math.min(1, time / 1e6 / asset.duration), message: 'Reading audio peaks…' });
      ff.on('log', log); ff.on('progress', progress);
      try {
        await ff.writeFile(input, new Uint8Array(await source.arrayBuffer()));
        if (await ff.exec(waveformArgs(asset, input)) !== 0 || !collector.points.length) throw new Error(`Could not read this file’s audio waveform. ${messages.slice(-5).join(' ')}`);
        return collector.points;
      } finally { ff.off('log', log); ff.off('progress', progress); await ff.deleteFile(input).catch(() => {}); }
    },
  };
}
