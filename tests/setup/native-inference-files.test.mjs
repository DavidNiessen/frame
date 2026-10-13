import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url),
  { configureNativeInferenceFiles } = require('../../scripts/native-inference-files.cjs');
const { getFileMatchers } = require('app-builder-lib/out/fileMatcher.js');
for (const platform of ['linux', 'darwin', 'win32'])
  for (const arch of ['x64', 'arm64'])
    test(`packages only matching inference binaries without including the checkout: ${platform}/${arch}`, () => {
      const config = {
        files: [
          {
            from: '.',
            to: '.',
            filter: ['dist/**/*', 'dist-electron/**/*', 'package.json', '!dist/ffmpeg/**/*'],
          },
        ],
      };
      configureNativeInferenceFiles(config.files, platform, arch);
      const matchers = getFileMatchers(config, 'files', '/tmp/package', {
        defaultSrc: process.cwd(),
        globalOutDir: '/tmp/output',
        macroExpander: (value) => value,
        customBuildOptions: {},
      });
      assert.equal(matchers.length, 1);
      const matcher = matchers[0].createFilter(),
        filter = (file) => matcher(file, { isDirectory: () => false });
      assert.equal(filter(`${process.cwd()}/dist/index.html`), true);
      assert.equal(filter(`${process.cwd()}/.local/private.txt`), false);
      assert.equal(filter(`${process.cwd()}/dist/ffmpeg/ffmpeg-core.wasm`), false);
      assert.equal(config.files.length, 1);
      const patterns = config.files[0].filter;
      assert.ok(
        !patterns.includes(`!node_modules/onnxruntime-node/bin/napi-v3/${platform}/${arch}/**/*`),
      );
      for (const other of ['linux', 'darwin', 'win32'].filter((item) => item !== platform))
        assert.ok(patterns.includes(`!node_modules/onnxruntime-node/bin/napi-v3/${other}/**/*`));
    });
