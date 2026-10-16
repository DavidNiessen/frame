import { extraInstances } from './effect-instances';
import { activeAtSource } from './timed-adjustments';
import type { EditSettings } from './types';

let context: AudioContext | undefined;
const graphs = new WeakMap<HTMLMediaElement, PlaybackAudio>();
interface PlaybackAudio {
  context: AudioContext;
  source: MediaElementAudioSourceNode;
  gain: GainNode;
  analyser: AnalyserNode;
  filters: BiquadFilterNode[];
  signature: string;
  connected: boolean;
}
export function playbackAudio(media: HTMLMediaElement) {
  return graphs.get(media);
}

/** One persistent route per element, shared by monitoring and live EQ. */
export async function startPlaybackAudio(media: HTMLMediaElement, active = () => true) {
  if (!globalThis.AudioContext || !active()) return;
  context ??= new AudioContext();
  if (context.state !== 'running') await context.resume();
  if (context.state !== 'running' || !active()) return;
  let graph = graphs.get(media);
  if (!graph) {
    const source = context.createMediaElementSource(media),
      gain = context.createGain(),
      analyser = context.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.75;
    graph = { context, source, gain, analyser, filters: [], signature: '', connected: false };
    graphs.set(media, graph);
  }
  if (!graph.connected) {
    let previous: AudioNode = graph.source;
    for (const filter of graph.filters) {
      previous.connect(filter);
      previous = filter;
    }
    previous.connect(graph.gain);
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
  graph.filters.forEach((filter) => filter.disconnect());
  graph.gain.disconnect();
  graph.analyser.disconnect();
  graph.connected = false;
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

export function updatePlaybackAudio(
  media: HTMLMediaElement,
  equalizers: EditSettings['equalizer'][],
  volume: number,
) {
  const graph = graphs.get(media);
  if (!graph?.connected) return false;
  const signature = JSON.stringify(equalizers);
  if (graph.signature !== signature) {
    graph.signature = signature;
    const values = equalizers.flatMap((eq) => [eq.bass, eq.mid, eq.treble]);
    // Keep existing nodes when a slider changes; only reconnect on stack changes.
    if (graph.filters.length !== values.length) {
      graph.source.disconnect();
      graph.filters.forEach((filter) => filter.disconnect());
      graph.filters = values.map((_, index) => {
        const filter = graph.context.createBiquadFilter(),
          band = index % 3;
        filter.type = (['lowshelf', 'peaking', 'highshelf'] as const)[band];
        filter.frequency.value = [100, 1000, 8000][band];
        filter.Q.value = 1;
        return filter;
      });
      let previous: AudioNode = graph.source;
      for (const filter of graph.filters) {
        previous.connect(filter);
        previous = filter;
      }
      previous.connect(graph.gain);
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
