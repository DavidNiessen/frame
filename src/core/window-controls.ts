export type WindowAction = 'minimize' | 'toggle-maximize' | 'close';
export interface WindowState { maximized: boolean; fullscreen: boolean; focused: boolean }
