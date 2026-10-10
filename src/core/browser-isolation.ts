/** Pages needs a controlling service worker before its first isolated navigation. */
export async function prepareBrowserIsolation() {
  if (import.meta.env.VITE_GITHUB_PAGES !== 'true' || window.frameDesktop || crossOriginIsolated || !navigator.serviceWorker || !window.isSecureContext) return;
  const key = 'frame:pages-isolation-reload';
  const reload = () => {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, 'true');
    location.reload();
  };
  navigator.serviceWorker.addEventListener('controllerchange', reload, { once: true });
  try {
    await navigator.serviceWorker.register(new URL('isolation-worker.js', document.baseURI), { scope: './', updateViaCache: 'none' });
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) reload();
  } catch (error) {
    navigator.serviceWorker.removeEventListener('controllerchange', reload);
    console.warn('Could not enable browser media processing on GitHub Pages.', error);
  }
}
