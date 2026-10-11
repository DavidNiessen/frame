import { execFileSync } from 'node:child_process';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const validVersion = (value) =>
  typeof value === 'string' &&
  value.trim() === value &&
  pattern.test(value) &&
  value.split('.').every((part) => Number.isSafeInteger(Number(part)));
const compare = (a, b) => {
  const left = a.split('.').map(Number),
    right = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] - right[i];
  return 0;
};

// Published tags persist the release line without generating version-bump commits in CI.
export function selectReleaseVersion({
  fallback,
  releases = [],
  requested = '',
  kind = 'prerelease',
}) {
  if (
    !['prerelease', 'release'].includes(kind) ||
    !validVersion(fallback) ||
    (requested && !validVersion(requested))
  ) {
    throw new Error('Choose release or prerelease and a version such as 1.0.0.');
  }
  let version = fallback;
  for (const release of releases) {
    if (release.draft) continue;
    const match = /^v(\d+\.\d+\.\d+)(?:-build\.\d+)?$/.exec(release.tag_name);
    if (!match || !validVersion(match[1])) continue;
    let candidate = match[1];
    if (!release.prerelease) {
      const [major, minor, patch] = candidate.split('.').map(Number);
      candidate = `${major}.${minor}.${patch + 1}`;
    }
    if (compare(candidate, version) > 0) version = candidate;
  }
  if (requested) {
    if (compare(requested, version) < 0) throw new Error(`Version must be at least ${version}.`);
    version = requested;
  }
  return { version, kind };
}

export async function applyReleaseVersion(
  version,
  root = new URL('../', import.meta.url),
  release,
) {
  if (!validVersion(version)) throw new Error('Invalid release version.');
  if (
    release &&
    (!['release', 'prerelease'].includes(release.kind) ||
      !/^[1-9]\d*$/.test(String(release.build)) ||
      !Number.isSafeInteger(Number(release.build)))
  )
    throw new Error('Invalid release build metadata.');
  for (const name of ['package.json', 'package-lock.json']) {
    const path = new URL(name, root);
    const data = JSON.parse(await readFile(path, 'utf8'));
    data.version = version;
    if (name === 'package.json' && release)
      data.frameReleaseTag = `v${version}${release.kind === 'prerelease' ? `-build.${release.build}` : ''}`;
    if (data.packages?.['']) data.packages[''].version = version;
    await writeFile(path, `${JSON.stringify(data, null, 2)}\n`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === '--apply') {
    await applyReleaseVersion(
      process.env.FRAME_RELEASE_VERSION,
      undefined,
      process.env.GITHUB_RUN_NUMBER
        ? {
            kind: process.env.FRAME_RELEASE_KIND || 'prerelease',
            build: process.env.GITHUB_RUN_NUMBER,
          }
        : undefined,
    );
  } else {
    const { version: fallback } = JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8'),
    );
    const trusted =
      process.env.GITHUB_REF === 'refs/heads/master' &&
      ['push', 'workflow_dispatch'].includes(process.env.GITHUB_EVENT_NAME);
    const releases = trusted
      ? JSON.parse(
          execFileSync(
            'gh',
            [
              'api',
              '--paginate',
              '--slurp',
              `repos/${process.env.GITHUB_REPOSITORY}/releases?per_page=100`,
            ],
            { encoding: 'utf8' },
          ),
        ).flat()
      : [];
    const result = selectReleaseVersion({
      fallback,
      releases,
      requested: process.env.REQUESTED_VERSION || '',
      kind: process.env.REQUESTED_KIND || 'prerelease',
    });
    if (process.env.GITHUB_OUTPUT)
      await appendFile(
        process.env.GITHUB_OUTPUT,
        `version=${result.version}\nkind=${result.kind}\n`,
      );
    console.log(`Building Frame ${result.version} (${result.kind}).`);
  }
}
