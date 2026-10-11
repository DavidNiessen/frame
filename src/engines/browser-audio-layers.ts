import type { FFmpeg } from '@ffmpeg/ffmpeg';
import type { AudioLayerInput } from '../core/audio-layers';
import { audioLayerSource } from '../core/audio-layers';
import type { MediaAsset } from '../core/types';
export async function writeBrowserLayers(
  ff: FFmpeg,
  layers: AudioLayerInput[],
  files: Map<string, File>,
  sources: Map<string, MediaAsset>,
) {
  const written = new Set<string>();
  for (const item of layers) {
    if (written.has(item.path)) continue;
    const source = audioLayerSource(item.layer, [...sources.values()]),
      file = source && files.get(source.id);
    if (!file) throw new Error(`Import “${item.layer.source.name}” to restore its audio track.`);
    await ff.writeFile(item.path, new Uint8Array(await file.arrayBuffer()));
    written.add(item.path);
  }
}
