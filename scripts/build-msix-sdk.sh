#!/usr/bin/env bash
# Maintainer/CI tool only. Normal installs use the committed public package.
set -euo pipefail
tools_dir="${1:?Usage: bash scripts/build-msix-sdk.sh OUTPUT_DIRECTORY}"
sdk_commit=25a65f5c1690930813bcc10cdf1d59fa865f2bb1
sdk_sha256=4f7acbdf4041c176c16dfcc5a449a74cfa5857d404853524f59fd70712c1c7fd
mkdir -p "$tools_dir/source"
curl --fail --location --retry 3 --silent --show-error \
  "https://api.github.com/repos/microsoft/msix-packaging/tarball/$sdk_commit" \
  --output "$tools_dir/source.tar.gz"
printf '%s  %s\n' "$sdk_sha256" "$tools_dir/source.tar.gz" | sha256sum --check
tar -xzf "$tools_dir/source.tar.gz" --strip-components=1 -C "$tools_dir/source"
cmake -S "$tools_dir/source" -B "$tools_dir/build" \
  -DLINUX=ON -DMSIX_PACK=ON -DUSE_VALIDATION_PARSER=ON \
  -DMSIX_TESTS=OFF -DMSIX_SAMPLES=OFF -DSKIP_BUNDLES=ON \
  -DCMAKE_BUILD_TYPE=Release -DCMAKE_POLICY_VERSION_MINIMUM=3.5
cmake --build "$tools_dir/build" --parallel 2
