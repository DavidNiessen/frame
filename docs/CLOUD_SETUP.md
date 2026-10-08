# Cloud development

The checkout is `/workspace/media-editor`. Each cloud task is already isolated; use this checkout and do not create a Git worktree unless requested.

Run `bash scripts/cloud-setup.sh` to install the lockfile dependencies, install Playwright Chromium into a writable cache, copy local WebAssembly assets/notices, execute the core/native conversion tests, and build both targets. It puts npm/Electron caches under `/workspace` because the container's home directory is read-only. Existing proxy settings are used without recording credential values. Node 24 is supplied by the environment. No media API credentials or external services are required.

Start the web editor from the checkout using `npm run dev -- --port 5173`. The service must be restarted in new tasks; processes do not survive snapshots. Verify the HTML response and run `PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/playwright npm run test:e2e` to validate the actual editor and WebAssembly conversions. The cloud onboarding UI does not expose localhost previews; use internal requests and browser tests.

For Electron verification this prepared snapshot contains a workspace-local Xvfb executable at `.local/sysroot/usr/bin/Xvfb`, installed from Debian's signed package index. Start it if no display is available:

```sh
.local/sysroot/usr/bin/Xvfb :99 -screen 0 1600x1000x24 -nolisten tcp -ac > /tmp/frame-xvfb.log 2>&1 &
export DISPLAY=:99
export XDG_CACHE_HOME=/workspace/.cache
export XDG_CONFIG_HOME=/workspace/.config
FRAME_TEST_NO_SANDBOX=1 npm run test:desktop
```

The test-only no-sandbox launcher option is needed by this container; it is not added to application startup or distributable builds. For a new environment without the retained local Xvfb, install Xvfb using the system's supported package manager, or validate Electron in the native CI jobs. Full Playwright Chromium is retained under `/workspace/.cache/playwright`. Set `PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/playwright` when running browser tests. An explicit `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` can select another installed browser; codec support may differ.

Use `npm run dev:desktop` in a graphical session when developing desktop interactions. Packaging requires `electron_config_cache` and `ELECTRON_BUILDER_CACHE` to point to writable directories in this container. `npm run package:dir` produces `release/linux-unpacked/`; the desktop suite accepts `FRAME_TEST_EXECUTABLE` to validate that artifact.

Saved setup/start instructions do not publish the environment. Review and save them in environment settings, then publish the prepared environment to snapshot dependencies and retained helper files.
