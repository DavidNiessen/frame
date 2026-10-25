import { extraInstances, instanceRecipe } from './effect-instances';
import { activeAtSource } from './timed-adjustments';
import type { NoiseStage } from './spectral-denoise';
import type { EditSettings } from './types';
import denoiseWorklet from '../engines/denoise-worklet.ts?worker&url';

let context: AudioContext | undefined, worklet: Promise<boolean> | undefined;
const graphs = new WeakMap<HTMLMediaElement, PlaybackAudio>();
interface PlaybackAudio {
  context: AudioContext;
  source: MediaElementAudioSourceNode;
  gain: GainNode;
  analyser: AnalyserNode;
  filters: BiquadFilterNode[];
  /** Present while the edit reduces noise anywhere; it adds `denoiseSize` samples of latency. */
  denoise?: AudioWorkletNode;
  signature: string;
  noise: string;
  connected: boolean;
}
export function playbackAudio(media: HTMLMediaElement) {
  return graphs.get(media);
}
/** Whether noise reduction can run live in this browser rather than in a rendered soundtrack. */
export const supportsLiveNoiseReduction = () =>
  !!globalThis.AudioContext && typeof globalThis.AudioWorkletNode === 'function' && !workletFailed;
let workletFailed = false;

/** source → noise reduction → equalizers → gain → analyser → output */
function wire(graph: PlaybackAudio) {
  graph.source.disconnect();
  graph.denoise?.disconnect();
  graph.filters.forEach((filter) => filter.disconnect());
  let previous: AudioNode = graph.source;
  for (const node of [...(graph.denoise ? [graph.denoise] : []), ...graph.filters]) {
    previous.connect(node);
    previous = node;
  }
  previous.connect(graph.gain);
}

/** One persistent route per element, shared by monitoring, live EQ and noise reduction. */
export async function startPlaybackAudio(media: HTMLMediaElement, active = () => true) {
  if (!globalThis.AudioContext || !active()) return;
  context ??= new AudioContext();
  if (context.state !== 'running') await context.resume();
  if (supportsLiveNoiseReduction())
    // Should the module fail to load, later previews render noise reduction instead.
    worklet ??= context.audioWorklet.addModule(denoiseWorklet).then(
      () => true,
      () => !(workletFailed = true),
    );
  await worklet;
  if (context.state !== 'running' || !active()) return;
  let graph = graphs.get(media);
  if (!graph) {
    const source = context.createMediaElementSource(media),
      gain = context.createGain(),
      analyser = context.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.75;
    graph = {
      context,
      source,
      gain,
      analyser,
      filters: [],
      signature: '',
      noise: '',
      connected: false,
    };
    graphs.set(media, graph);
  }
  if (!graph.connected) {
    wire(graph);
    graph.gain.connect(graph.analyser);
    graph.analyser.connect(context.destination);
    graph.connected = true;
  }
  return graph;
}

/** Detached media must not be retained by an active context's destination graph. */
export function releasePlaybackAudio(media: HTMLMediaElement) {
  const graph = graphs.get(media);
  if (!graph?.connected) return;
  graph.source.disconnect();
  graph.denoise?.disconnect();
  graph.filters.forEach((filter) => filter.disconnect());
  graph.gain.disconnect();
  graph.analyser.disconnect();
  graph.connected = false;
}

const companions = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();
/**
 * Play another element through this element's corrections, as the cut bridge's
 * standby decoder does while the muted source seeks.
 */
export function joinPlaybackAudio(media: HTMLMediaElement, other: HTMLMediaElement) {
  const graph = graphs.get(media);
  if (!graph?.connected) return;
  let source = companions.get(other);
  if (!source) companions.set(other, (source = graph.context.createMediaElementSource(other)));
  source.disconnect();
  source.connect(graph.denoise ?? graph.filters[0] ?? graph.gain);
}

export function realtimeEqualizers(edit: EditSettings, source: number, output: number) {
  const result = activeAtSource(edit.effectRanges?.equalizer, source) ? [edit.equalizer] : [];
  for (const instance of extraInstances(edit, 'equalizer'))
    if (
      instance.settings.equalizer &&
      activeAtSource(instance.range, instance.timeSpace === 'output' ? output : source)
    )
      result.push(instance.settings.equalizer);
  return result.filter((eq) => eq.bass || eq.mid || eq.treble);
}
/** The noise reductions active at a playback position, in `cleanupFilters` order. */
export function realtimeNoise(edit: EditSettings, source: number, output: number): NoiseStage[] {
  const result: NoiseStage[] = [];
  if (edit.reduceNoise && activeAtSource(edit.effectRanges?.noise, source))
    result.push({ strength: edit.noiseStrength, floor: edit.noiseFloor });
  for (const instance of extraInstances(edit, 'noise')) {
    const view = instanceRecipe(edit, instance);
    if (
      view.reduceNoise &&
      activeAtSource(instance.range, instance.timeSpace === 'output' ? output : source)
    )
      result.push({ strength: view.noiseStrength, floor: view.noiseFloor });
  }
  return result;
}

/**
 * Apply live corrections. `noise` is null when the edit never reduces noise, so
 * playback keeps its normal latency; an empty list keeps the reducer idle.
 */
export function updatePlaybackAudio(
  media: HTMLMediaElement,
  equalizers: EditSettings['equalizer'][],
  volume: number,
  noise: NoiseStage[] | null = null,
) {
  const graph = graphs.get(media);
  if (!graph?.connected) return false;
  const reducing = !!noise && supportsLiveNoiseReduction();
  if (reducing !== !!graph.denoise) {
    graph.denoise?.disconnect();
    graph.denoise?.port.close();
    graph.denoise = reducing ? new AudioWorkletNode(graph.context, 'frame-denoise') : undefined;
    graph.noise = '';
    wire(graph);
  }
  const stages = JSON.stringify(noise ?? []);
  if (graph.denoise && graph.noise !== stages) {
    graph.noise = stages;
    graph.denoise.port.postMessage(noise ?? []);
  }
  const signature = JSON.stringify(equalizers);
  if (graph.signature !== signature) {
    graph.signature = signature;
    const values = equalizers.flatMap((eq) => [eq.bass, eq.mid, eq.treble]);
    // Keep existing nodes when a slider changes; only reconnect on stack changes.
    if (graph.filters.length !== values.length) {
      graph.filters.forEach((filter) => filter.disconnect());
      graph.filters = values.map((_, index) => {
        const filter = graph.context.createBiquadFilter(),
          band = index % 3;
        filter.type = (['lowshelf', 'peaking', 'highshelf'] as const)[band];
        filter.frequency.value = [100, 1000, 8000][band];
        filter.Q.value = 1;
        return filter;
      });
      wire(graph);
    }
    values.forEach((value, index) => {
      const parameter = graph.filters[index].gain;
      parameter.cancelScheduledValues(graph.context.currentTime);
      parameter.setTargetAtTime(value, graph.context.currentTime, 0.008);
    });
  }
  // Element gain remains the monitoring control. The graph provides gain >100%
  // without clipping it to the HTMLMediaElement volume range.
  graph.gain.gain.value = Math.max(0, volume);
  return true;
}
