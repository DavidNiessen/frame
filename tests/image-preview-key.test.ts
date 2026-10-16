import { expect, it } from 'vitest';
import { imagePreviewKey } from '../src/core/image-preview-key';
import { defaultSettings, type MediaAsset } from '../src/core/types';
const asset = { id: 'image', kind: 'image', duration: 1, width: 100, height: 100 } as MediaAsset;
it('reuses image content across equivalent recipes and export formats with compact keys', async () => {
  const edit = {
    ...defaultSettings(asset),
    painting: {
      ...defaultSettings(asset).painting!,
      image: `data:image/png;base64,${'A'.repeat(50000)}`,
    },
  };
  const key = await imagePreviewKey(asset, edit);
  expect(key).toBe(await imagePreviewKey(asset, { ...structuredClone(edit), format: 'jpeg' }));
  expect(key.length).toBeLessThan(100);
  expect(await imagePreviewKey({ ...asset, id: 'other' }, edit)).not.toBe(key);
  expect(
    await imagePreviewKey(asset, {
      ...edit,
      painting: { ...edit.painting, image: edit.painting.image + 'B' },
    }),
  ).not.toBe(key);
});
