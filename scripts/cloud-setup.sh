#!/usr/bin/env bash
set -euo pipefail
cd /workspace/media-editor
export XDG_CACHE_HOME=/workspace/.cache
export XDG_CONFIG_HOME=/workspace/.config
export electron_config_cache=/workspace/.cache/electron
export PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/playwright
export ELECTRON_BUILDER_CACHE=/workspace/.cache/electron-builder
if [[ -n "${HTTPS_PROXY:-${HTTP_PROXY:-}}" ]]; then
  export ELECTRON_GET_USE_PROXY=1
  export GLOBAL_AGENT_HTTP_PROXY="${HTTPS_PROXY:-$HTTP_PROXY}"
fi
npm ci --no-audit --no-fund --cache /workspace/.npm-cache
npx playwright install chromium
npm test
npm run build
