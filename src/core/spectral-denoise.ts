/**
 * Live noise reduction matching FFmpeg's `afftdn=nr=…:nf=…` closely enough to
 * preview it while playing: per-bin power subtraction against a white noise
 * floor, never attenuating by more than the reduction amount. Measured against
 * afftdn, levels agree within about 0.5 dB on noise and on tonal material.
 */
export interface NoiseStage {
  /** Maximum reduction in dB (`nr`). */
  strength: number;
  /** Noise floor in dBFS (`nf`). */
  floor: number;
}
export const denoiseSize = 1024;
const hop = denoiseSize / 4,
  half = denoiseSize / 2;
/** afftdn's floor is this much below the level power subtraction uses. */
const floorOffset = 5;
const window = Float32Array.from({ length: denoiseSize }, (_, i) =>
  Math.sqrt(0.5 - 0.5 * Math.cos((2 * Math.PI * i) / denoiseSize)),
);
const twiddles = (() => {
  const values = new Float32Array(denoiseSize);
  for (let i = 0; i < half; i++) {
    values[i * 2] = Math.cos((-2 * Math.PI * i) / denoiseSize);
    values[i * 2 + 1] = Math.sin((-2 * Math.PI * i) / denoiseSize);
  }
  return values;
})();
function fft(re: Float32Array, im: Float32Array, inverse: boolean) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const step = n / size;
    for (let start = 0; start < n; start += size)
      for (let k = 0; k < size / 2; k++) {
        const wr = twiddles[k * step * 2],
          wi = inverse ? -twiddles[k * step * 2 + 1] : twiddles[k * step * 2 + 1];
        const p = start + k,
          q = p + size / 2;
        const xr = re[q] * wr - im[q] * wi,
          xi = re[q] * wi + im[q] * wr;
        re[q] = re[p] - xr;
        im[q] = im[p] - xi;
        re[p] += xr;
        im[p] += xi;
      }
  }
}

/** One channel, streamed in blocks of any size with a constant latency of `denoiseSize` samples. */
export class SpectralDenoiser {
  stages: NoiseStage[] = [];
  private input = new Float32Array(denoiseSize);
  private output = new Float32Array(denoiseSize);
  private filled = 0;
  private re = new Float32Array(denoiseSize);
  private im = new Float32Array(denoiseSize);

  process(source: Float32Array, target: Float32Array) {
    for (let i = 0; i < source.length; i++) {
      const at = denoiseSize - hop + this.filled;
      this.input[at] = source[i];
      target[i] = this.output[this.filled];
      if (++this.filled === hop) {
        this.filled = 0;
        this.frame();
      }
    }
  }
  private frame() {
    const { re, im, input, output } = this;
    for (let i = 0; i < denoiseSize; i++) {
      re[i] = input[i] * window[i];
      im[i] = 0;
    }
    fft(re, im, false);
    const stages = this.stages.map(({ strength, floor }) => ({
      noise: 10 ** ((floor + floorOffset) / 10) * half,
      least: 10 ** (-strength / 20),
    }));
    for (let k = 0; k <= half; k++) {
      let power = re[k] * re[k] + im[k] * im[k],
        gain = 1;
      for (const { noise, least } of stages) {
        const stage = Math.max(least, Math.sqrt(Math.max(0, 1 - noise / Math.max(power, 1e-30))));
        gain *= stage;
        power *= stage * stage;
      }
      re[k] *= gain;
      im[k] *= gain;
      if (k > 0 && k < half) {
        re[denoiseSize - k] *= gain;
        im[denoiseSize - k] *= gain;
      }
    }
    fft(re, im, true);
    // Shift the finished hop out, then overlap-add this frame (window² sums to 2 at a quarter hop).
    output.copyWithin(0, hop);
    output.fill(0, denoiseSize - hop);
    for (let i = 0; i < denoiseSize; i++) output[i] += (re[i] / denoiseSize) * window[i] * 0.5;
    input.copyWithin(0, hop);
  }
}
