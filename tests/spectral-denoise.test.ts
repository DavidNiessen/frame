import { expect, it } from 'vitest';
import { denoiseSize, SpectralDenoiser } from '../src/core/spectral-denoise';

let seed = 1;
const random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648) * 2 - 1;
const noise = Float32Array.from({ length: 48000 * 2 }, random);
const level = (samples: Float32Array) => {
  let sum = 0;
  for (let i = denoiseSize * 2; i < samples.length; i++) sum += samples[i] ** 2;
  return 10 * Math.log10(sum / (samples.length - denoiseSize * 2));
};
/** Streams in 128-sample render quanta, as an AudioWorklet does. */
function run(input: Float32Array, stages: SpectralDenoiser['stages']) {
  const denoiser = new SpectralDenoiser(),
    output = new Float32Array(input.length);
  denoiser.stages = stages;
  for (let i = 0; i < input.length; i += 128)
    denoiser.process(input.subarray(i, i + 128), output.subarray(i, i + 128));
  return output;
}

it('passes audio through unchanged, one window late, without a noise stage', () => {
  const tone = Float32Array.from({ length: 48000 }, (_, i) => 0.3 * Math.sin(i * 0.0576));
  const output = run(tone, []);
  let error = 0;
  for (let i = denoiseSize * 2; i < tone.length; i++)
    error = Math.max(error, Math.abs(output[i] - tone[i - denoiseSize]));
  expect(error).toBeLessThan(1e-4);
});

// Output levels FFmpeg's afftdn produced for white noise of each amplitude.
it.each([
  [0.001, 12, -50, -76.7],
  [0.01, 6, -50, -48.1],
  [0.01, 12, -30, -56.8],
  [0.01, 24, -30, -68.8],
  [0.03, 12, -50, -35.6],
  [0.1, 24, -30, -29.8],
])(
  'reduces white noise of amplitude %f like afftdn=nr=%i:nf=%i',
  (amplitude, strength, floor, expected) => {
    const output = run(
      noise.map((value) => value * amplitude),
      [{ strength, floor }],
    );
    expect(Math.abs(level(output) - expected)).toBeLessThan(1);
  },
);
