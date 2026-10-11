import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { App } from 'electron';
import { configureShutdown } from '../electron/shutdown';

describe('application shutdown', () => {
  it('finishes the first quit without re-entering native quit and drains work only once', async () => {
    let finish!: () => void;
    const cleanup = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const app = Object.assign(new EventEmitter(), { exit: vi.fn(), quit: vi.fn() });
    configureShutdown(app as unknown as App, cleanup);
    const event = { preventDefault: vi.fn() };
    app.emit('before-quit', event);
    app.emit('before-quit', event);
    await vi.waitFor(() => expect(cleanup).toHaveBeenCalledTimes(1));
    finish();
    await vi.waitFor(() => expect(app.exit).toHaveBeenCalledWith(0));
    expect(app.quit).not.toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalledTimes(2);
  });
  it('does not let a stalled background operation require a second quit', async () => {
    const app = Object.assign(new EventEmitter(), { exit: vi.fn() });
    configureShutdown(app as unknown as App, () => new Promise(() => {}), 10);
    app.emit('before-quit', { preventDefault() {} });
    await vi.waitFor(() => expect(app.exit).toHaveBeenCalledTimes(1));
  });
});
