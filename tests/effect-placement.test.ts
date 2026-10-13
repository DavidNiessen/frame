import { expect, it } from 'vitest';
import { effectLibrary, effectPlacement } from '../src/core/effect-library';

it('describes every effect by its current placement rather than legacy project scope', () => {
  const placements = Object.fromEntries(
    effectLibrary.map((effect) => [effect.id, effectPlacement(effect)]),
  );
  expect(placements).toEqual({
    ...Object.fromEntries(
      [
        'painting',
        'retouch',
        'curves',
        'shape',
        'exposure',
        'gamma',
        'shadows',
        'highlights',
        'vibrance',
        'hue',
        'tint',
        'vignette',
        'blur',
        'sharpen',
        'grayscale',
        'sepia',
        'invert',
        'pixelate',
        'posterize',
        'grain',
        'sketch',
        'emboss',
      ].map((id) => [id, 'timed']),
    ),
    silence: 'source',
    speed: 'track',
    normalize: 'track',
    crop: 'track',
    transform: 'track',
    volume: 'timed',
    audioFadeIn: 'timed',
    audioFadeOut: 'timed',
    noise: 'timed',
    equalizer: 'timed',
    videoFadeIn: 'timed',
    videoFadeOut: 'timed',
    color: 'timed',
    captions: 'timed',
    watermark: 'timed',
  });
});
