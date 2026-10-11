import type { App } from 'electron';

/** Drain background work once, then exit directly instead of re-entering Cocoa's quit action. */
export function configureShutdown(app: App, cleanup: () => Promise<void>, timeout = 3000) {
  let shuttingDown = false;
  app.on('before-quit', (event) => {
    event.preventDefault();
    if (shuttingDown) return;
    shuttingDown = true;
    const timer = setTimeout(() => app.exit(0), timeout);
    void Promise.resolve()
      .then(cleanup)
      .catch(() => {})
      .finally(() => {
        clearTimeout(timer);
        // app.quit() inside an intercepted macOS quit can only dismiss its native window
        // transition on the first attempt. All persistence and cancellation happened above.
        app.exit(0);
      });
  });
}
