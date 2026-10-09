export type Workflow = 'edit' | 'convert';
/** Only an opaque request ID crosses the preload boundary, never source paths. */
export interface DesktopLaunchRequest { id: string; workflow: Workflow; count: number }
