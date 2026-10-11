#!/usr/bin/env bash
set -euo pipefail

# Test the shipped disk image, not the development Electron runtime.
frame_version=$(node -p "require('./package.json').version")
frame_arch=$(node -p 'process.arch')
frame_image="release/Frame-${frame_version}-mac-${frame_arch}.dmg"
frame_test_dir=$(mktemp -d "${TMPDIR:-/tmp}/frame-package.XXXXXX")
frame_mount="${frame_test_dir}/mounted"
frame_attached=false
cleanup() {
  if [[ "${frame_attached}" == true ]]; then
    hdiutil detach "${frame_mount}"
  fi
  rm -rf "${frame_test_dir}"
}
trap cleanup EXIT

hdiutil verify "${frame_image}"
mkdir -p "${frame_mount}"
hdiutil attach "${frame_image}" -readonly -nobrowse -mountpoint "${frame_mount}"
frame_attached=true
ditto "${frame_mount}/Frame.app" "${frame_test_dir}/Frame.app"
frame_app="${frame_test_dir}/Frame.app"

# A copied .app must have a valid resource seal and valid nested code signatures.
codesign --verify --deep --strict --verbose=2 "${frame_app}"
codesign --display --verbose=2 "${frame_app}"

FRAME_TEST_EXECUTABLE="${frame_app}/Contents/MacOS/Frame" \
  npx playwright test --config playwright.electron.config.ts tests/electron/desktop.spec.ts

# Prove the check covers Frame's changed resources, not only Electron's executable.
printf '\0' >> "${frame_app}/Contents/Resources/app.asar"
if codesign --verify --deep --strict "${frame_app}"; then
  echo 'Signature verification accepted modified application resources.' >&2
  exit 1
fi
