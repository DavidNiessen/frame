import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';

export type WindowIpc = Pick<typeof ipcMain, 'handle'>;
type Handler = Parameters<typeof ipcMain.handle>[1];

/** Register channels once, then dispatch only to the originating window's session. */
export class WindowIpcRouter {
  private channels = new Map<string, Map<number, Handler>>();
  scope(window: BrowserWindow): WindowIpc {
    const id = window.webContents.id;
    window.once('closed', () => { for (const handlers of this.channels.values()) handlers.delete(id); });
    return { handle: (channel, handler) => {
      let handlers = this.channels.get(channel);
      if (!handlers) {
        handlers = new Map(); this.channels.set(channel, handlers);
        ipcMain.handle(channel, (event, ...args) => {
          const target = this.channels.get(channel)?.get(event.sender.id);
          if (!target || event.senderFrame !== event.sender.mainFrame) throw new Error('Untrusted request.');
          return target(event, ...args);
        });
      }
      handlers.set(id, handler);
    } };
  }
}
export function trustWindow(window: BrowserWindow) {
  return (event: IpcMainInvokeEvent) => {
    if (window.isDestroyed() || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('Untrusted request.');
  };
}
