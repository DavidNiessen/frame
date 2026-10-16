import type { AudioLayerInput } from '../core/audio-layers';
import { audioLayerSource } from '../core/audio-layers';
import type { MediaAsset } from '../core/types';
import type { browserInputs } from './browser-inputs';
export async function mountBrowserLayers(
  layers: AudioLayerInput[],
  files: Map<string, File>,
  sources: Map<string, MediaAsset>,
  inputs: ReturnType<typeof browserInputs>,
) {
  for (const item of layers) {
    const source = audioLayerSource(item.layer, [...sources.values()]),
      file = source && files.get(source.id);
    if (!file) throw new Error(`Import “${item.layer.source.name}” to restore its audio track.`);
    item.path = await inputs.open(file);
  }
}
