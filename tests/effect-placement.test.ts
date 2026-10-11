import { expect, it } from 'vitest';
import { effectLibrary, effectPlacement } from '../src/core/effect-library';

it('describes every effect by its current placement rather than legacy project scope', () => {
  const placements = Object.fromEntries(
    effectLibrary.map((effect) => [effect.id, effectPlacement(effect)]),
  );
  expect(placements).toEqual({
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
