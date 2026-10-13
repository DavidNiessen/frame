const js = require('@eslint/js');
const tseslint = require('typescript-eslint');
const reactHooks = require('eslint-plugin-react-hooks');
const globals = require('globals');
const prettier = require('eslint-config-prettier/flat');

module.exports = tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'dist-electron/**',
      'release/**',
      'build/**',
      'vendor/**',
      'native/**',
      'public/ffmpeg/**',
      'public/image-decoders/**',
      'public/notices/**',
      'public/speech/**',
      'public/models/**',
      '.local/**',
      'coverage/**',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ['**/*.{ts,tsx,mts}'],
  })),
  {
    languageOptions: { globals: globals.node },
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Controls are deliberately matched when sanitizing imported paths and metadata.
      'no-control-regex': 'off',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
  {
    files: ['**/*.{ts,tsx,mts}'],
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
        },
      ],
    },
  },
  {
    files: ['tests/electron/**/*.ts'],
    // Playwright requires fixture destructuring even for tests without fixtures.
    rules: { 'no-empty-pattern': ['error', { allowObjectPatternsAsParameters: true }] },
  },
  {
    files: ['src/**/*.{ts,tsx}', 'public/*.js'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  prettier,
);
