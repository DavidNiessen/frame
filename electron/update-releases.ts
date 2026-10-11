import { FRAME_RELEASES_API } from '../src/core/app-updates';
import { boundedUpdateText, fetchUpdateResource, type UpdateFetch } from './update-download';

export async function fetchUpdateReleases(
  fetcher: UpdateFetch,
  previews: boolean,
  signal: AbortSignal,
) {
  if (!previews) {
    // /latest excludes drafts and prereleases and does not scan a growing preview history.
    const response = await fetcher(`${FRAME_RELEASES_API}/latest`, {
      signal,
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (response.status === 404) return [];
    const accepted = await fetchUpdateResource(
      async () => response,
      `${FRAME_RELEASES_API}/latest`,
      signal,
    );
    return [JSON.parse(await boundedUpdateText(accepted))];
  }
  const releases: unknown[] = [];
  for (let page = 1; page <= 10; page++) {
    const response = await fetchUpdateResource(
      fetcher,
      `${FRAME_RELEASES_API}?per_page=100&page=${page}`,
      signal,
    );
    const items: unknown = JSON.parse(await boundedUpdateText(response, 4 * 1024 * 1024));
    if (!Array.isArray(items)) throw new Error('GitHub returned an invalid release list.');
    releases.push(...items);
    if (items.length < 100) break;
  }
  return releases;
}
