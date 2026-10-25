import { SpectralDenoiser, type NoiseStage } from '../core/spectral-denoise';

declare const AudioWorkletProcessor: {
  prototype: { readonly port: MessagePort };
  new (): { readonly port: MessagePort };
};
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;

/** Live noise reduction for the playing source; the main thread posts the active stages. */
class DenoiseProcessor extends AudioWorkletProcessor {
  private channels: SpectralDenoiser[] = [];
  private stages: NoiseStage[] = [];
  private silence = new Float32Array(128);
  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent<NoiseStage[]>) => {
      this.stages = event.data;
      for (const channel of this.channels) channel.stages = this.stages;
    };
  }
  process(inputs: Float32Array[][], outputs: Float32Array[][]) {
    const input = inputs[0] ?? [],
      output = outputs[0] ?? [];
    output.forEach((target, index) => {
      const channel = (this.channels[index] ??= new SpectralDenoiser());
      channel.stages = this.stages;
      const source = input[index] ?? input[0] ?? this.silence;
      channel.process(source.length === target.length ? source : this.silence, target);
    });
    return true;
  }
}
registerProcessor('frame-denoise', DenoiseProcessor);
