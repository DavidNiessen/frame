export type WindowAction = 'minimize' | 'toggle-maximize' | 'close';
export const desktopChromeSpace = 28;
export interface WindowState {
  maximized: boolean;
  fullscreen: boolean;
  focused: boolean;
  contentHeight: number;
  chromeInset: number;
  chromeExpanded: boolean;
}
