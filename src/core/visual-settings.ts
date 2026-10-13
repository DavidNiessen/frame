/** Shared adjustments: values are deliberately independent for stacked effect instances. */
export const visualControls = {
  exposure: {
    name: 'Exposure',
    description: 'Brighten or darken in stops',
    min: -3,
    max: 3,
    step: 0.05,
    neutral: 0,
    initial: 0.4,
    unit: ' EV',
  },
  gamma: {
    name: 'Gamma',
    description: 'Adjust midtone luminance',
    min: 0.2,
    max: 3,
    step: 0.02,
    neutral: 1,
    initial: 1.15,
    unit: '',
  },
  shadows: {
    name: 'Shadows',
    description: 'Recover or deepen the dark areas',
    min: -1,
    max: 1,
    step: 0.02,
    neutral: 0,
    initial: 0.25,
    unit: '',
  },
  highlights: {
    name: 'Highlights',
    description: 'Recover or brighten the light areas',
    min: -1,
    max: 1,
    step: 0.02,
    neutral: 0,
    initial: -0.25,
    unit: '',
  },
  vibrance: {
    name: 'Vibrance',
    description: 'Boost muted colors gently',
    min: -1,
    max: 1,
    step: 0.02,
    neutral: 0,
    initial: 0.25,
    unit: '',
  },
  hue: {
    name: 'Hue',
    description: 'Shift the color spectrum',
    min: -180,
    max: 180,
    step: 1,
    neutral: 0,
    initial: 20,
    unit: '°',
  },
  tint: {
    name: 'Tint',
    description: 'Balance green and magenta',
    min: -1,
    max: 1,
    step: 0.02,
    neutral: 0,
    initial: 0.15,
    unit: '',
  },
  vignette: {
    name: 'Vignette',
    description: 'Shade the edges of the frame',
    min: 0,
    max: 1,
    step: 0.02,
    neutral: 0,
    initial: 0.5,
    unit: '',
  },
  blur: {
    name: 'Blur',
    description: 'Soften the image with a Gaussian blur',
    min: 0,
    max: 20,
    step: 0.2,
    neutral: 0,
    initial: 3,
    unit: ' px',
  },
  sharpen: {
    name: 'Sharpen',
    description: 'Bring out fine detail',
    min: 0,
    max: 2,
    step: 0.05,
    neutral: 0,
    initial: 0.6,
    unit: '',
  },
  grayscale: {
    name: 'Black & white',
    description: 'Remove color gradually',
    min: 0,
    max: 1,
    step: 0.02,
    neutral: 0,
    initial: 1,
    unit: '',
  },
  sepia: {
    name: 'Sepia',
    description: 'A warm, nostalgic look',
    min: 0,
    max: 1,
    step: 0.02,
    neutral: 0,
    initial: 0.8,
    unit: '',
  },
  invert: {
    name: 'Invert',
    description: 'Turn colors into a negative',
    min: 0,
    max: 1,
    step: 1,
    neutral: 0,
    initial: 1,
    unit: '',
  },
  pixelate: {
    name: 'Pixelate',
    description: 'Create a chunky mosaic',
    min: 1,
    max: 80,
    step: 1,
    neutral: 1,
    initial: 12,
    unit: ' px',
  },
  posterize: {
    name: 'Posterize',
    description: 'Reduce the number of color levels',
    min: 2,
    max: 256,
    step: 1,
    neutral: 256,
    initial: 8,
    unit: ' levels',
  },
  grain: {
    name: 'Film grain',
    description: 'Add a subtle analog texture',
    min: 0,
    max: 40,
    step: 1,
    neutral: 0,
    initial: 8,
    unit: '',
  },
  sketch: {
    name: 'Sketch',
    description: 'Turn edges into a pencil drawing',
    min: 0,
    max: 1,
    step: 1,
    neutral: 0,
    initial: 1,
    unit: '',
  },
  emboss: {
    name: 'Emboss',
    description: 'Raise contours into a relief',
    min: 0,
    max: 1,
    step: 1,
    neutral: 0,
    initial: 1,
    unit: '',
  },
} as const;
export type VisualEffect = keyof typeof visualControls;
export type VisualSettings = Record<VisualEffect, number>;
export const visualIds = Object.keys(visualControls) as VisualEffect[];
export const isVisualEffect = (id: string): id is VisualEffect => Object.hasOwn(visualControls, id);
export const defaultVisual = (): VisualSettings =>
  Object.fromEntries(visualIds.map((id) => [id, visualControls[id].neutral])) as VisualSettings;
export function parseVisual(value: unknown): VisualSettings {
  if (value === undefined) return defaultVisual();
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid visual adjustments.');
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !isVisualEffect(key)))
    throw new Error('Unknown visual adjustment.');
  const result = defaultVisual();
  for (const id of visualIds) {
    const number = input[id] ?? result[id],
      limits = visualControls[id];
    if (
      typeof number !== 'number' ||
      !Number.isFinite(number) ||
      number < limits.min ||
      number > limits.max ||
      (limits.step === 1 && !Number.isInteger(number))
    )
      throw new Error(`Invalid ${limits.name.toLowerCase()} value.`);
    result[id] = number;
  }
  return result;
}

export const hasVisualAdjustments = (settings?: VisualSettings) =>
  visualIds.some(
    (id) => (settings?.[id] ?? visualControls[id].neutral) !== visualControls[id].neutral,
  );
