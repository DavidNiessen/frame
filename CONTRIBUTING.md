# Contributing to Frame

Bug reports and focused improvements are welcome. Search existing issues before opening a new one. For larger changes, describe the proposed behavior in an issue before investing in an implementation.

## Set up

Use Node.js 24 and run `npm ci`, then `npm run dev` or `npm run desktop`. npm's lockfile is authoritative. pnpm contributors should run `pnpm import` and `pnpm install --frozen-lockfile`; do not commit the generated pnpm lockfile.

Electron needs a graphical session. Browser tests need Playwright Chromium: `npx playwright install chromium`. Linux desktop tests can run with `xvfb-run -a npm run test:desktop`. The [cloud guide](docs/CLOUD_SETUP.md) covers the managed headless workspace.

### Desktop installation troubleshooting

- If pnpm skipped dependency scripts, run `pnpm rebuild`, `pnpm run postinstall` and `pnpm setup:desktop`. The workspace permits the required Electron, FFprobe and build-tool scripts.
- `ELECTRON_SKIP_BINARY_DOWNLOAD` skips installation whenever it is nonempty, including `0` or `false`. Unset it, then run `npm run setup:desktop`.
- `ELECTRON_OVERRIDE_DIST_PATH` must point to a complete Electron runtime. Unset it if you do not need a custom runtime.
- The npm and pnpm overrides pin the ZIP reader that works with Node 24. Keep both overrides in sync.
- FFmpeg and yt-dlp are verified from `vendor/media-tools/`. Do not bypass checksums or replace them with arbitrary executables from PATH.

## Make a change

Keep components, hooks and core modules focused. Core edit logic should remain independent of React, Electron, filesystems and WebAssembly. Prefer shared planners and validation over implementing different edit semantics in the two engines. Read [architecture](docs/ARCHITECTURE.md) and [design](docs/DESIGN.md) first.

Preserve existing project/autosave compatibility when changing recipes. Validate renderer IPC in the main process, avoid exposing arbitrary filesystem operations, and clean up temporary files, Blob URLs, listeners and subprocesses when their owner closes.

Run:

```sh
npm run format
npm run check
npm test
```

Run relevant browser or desktop tests for behavior changes:

```sh
npm run test:e2e -- tests/e2e/timeline-edit.spec.ts
npm run test:desktop -- tests/electron/desktop.spec.ts
```

Tests should exercise observable behavior or actual media output. Preserve regressions for playback, undo, recovery, native setup and export; avoid tests that merely repeat the implementation. Long browser/conversion suites use one worker to keep FFmpeg memory use bounded.

Formatting is checked separately from ESLint. ESLint checks TypeScript, JavaScript and React hook dependencies with zero warnings permitted. Vendored binaries, generated outputs and fingerprinted Windows shell inputs are excluded from formatting. Do not reformat or regenerate native shell assets without following their [build/signing guide](native/windows-shell/README.md).

For history that skips the repository-wide formatting commit, run:

```sh
git config blame.ignoreRevsFile .git-blame-ignore-revs
```

## Pull requests

Use a descriptive conventional commit such as `fix: preserve playhead when trimming` or `feat: add an output preset`. Explain the problem, resulting behavior, and checks you ran. Include before/after screenshots for visible UI changes and mention platform-specific limitations. Keep unrelated cleanup separate.

CI builds and tests each native platform. Successful trusted `master` builds publish prerelease installers automatically; pull requests do not receive signing secrets or publish releases. Distribution changes must preserve the vendor licenses, integrity verification and complete set of platform artifacts described in [distribution](docs/DISTRIBUTION.md).

Do not include private signing keys, certificates with private keys, API tokens, local media, or generated build/cache directories in a contribution.
