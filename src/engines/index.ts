import type { MediaEngine } from '../core/types';
import { createDesktopEngine } from './desktop';
// Electron never loads the WebAssembly engine or duplicates its native dependencies.
export async function createEngine(): Promise<MediaEngine> {
  if (window.frameDesktop) return createDesktopEngine();
  const { createBrowserEngine } = await import('./browser');
  return createBrowserEngine();
}
