import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { verifySpeechModel } from '../../scripts/prepare-speech.mjs';
test('verifies the vendored model and rejects damaged weights before packaging', async () => {
  const model = await verifySpeechModel();
  assert.equal(model.revision, 'ff4177021cc41f7db950912b73ea4fdf7d01d8e7');
  assert.equal(Object.keys(model.files).length, 11);
  const directory = await mkdtemp(join(tmpdir(), 'frame-model-integrity-'));
  try {
    await cp('vendor/speech-models', directory, { recursive: true });
    await writeFile(
      join(directory, model.model, 'onnx/encoder_model_quantized.onnx'),
      'version https://git-lfs.github.com/spec/v1',
    );
    await assert.rejects(verifySpeechModel(directory), /corrupt/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
