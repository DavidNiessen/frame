export interface PanelSizes {
  library: number;
  inspector: number;
  timeline: number | null;
}
export const defaultPanelSizes: PanelSizes = { library: 220, inspector: 320, timeline: null };
export const clampPanel = (value: number, min: number, max: number) =>
  Math.round(Math.max(min, Math.min(max, value)));
export function readPanelSizes(input: unknown): PanelSizes {
  const values = input && typeof input === 'object' ? (input as Partial<PanelSizes>) : {};
  const size = (key: 'library' | 'inspector', min: number, max: number) =>
    typeof values[key] === 'number' && Number.isFinite(values[key])
      ? clampPanel(values[key]!, min, max)
      : defaultPanelSizes[key];
  return {
    library: size('library', 180, 400),
    inspector: size('inspector', 280, 480),
    timeline:
      typeof values.timeline === 'number' && Number.isFinite(values.timeline)
        ? clampPanel(values.timeline, 180, 2000)
        : null,
  };
}
/** Saved preferences never override the space needed by the media preview. */
export function editorPanelLayout(
  preferred: PanelSizes,
  width: number,
  height: number,
  viewportHeight = height,
) {
  const mode = width >= 1080 ? 'wide' : width >= 700 ? 'medium' : 'stacked';
  const inspectorMax =
    mode === 'wide'
      ? Math.min(480, width - 180 - 440 - 24)
      : mode === 'medium'
        ? Math.min(400, width - 360 - 12)
        : 480;
  const inspector = clampPanel(preferred.inspector, 280, inspectorMax);
  const libraryMax = mode === 'wide' ? Math.min(400, width - inspector - 440 - 24) : 400;
  const library = clampPanel(preferred.library, 180, libraryMax);
  const halfHeight = Math.floor(Math.max(0, height - 12) / 2);
  const previewMin = mode === 'stacked' ? 240 : Math.min(240, halfHeight);
  const timelineMin = mode === 'stacked' ? 180 : Math.min(180, halfHeight);
  const timelineMax =
    mode === 'stacked' ? 520 : Math.floor(Math.max(timelineMin, height - previewMin - 12));
  const timelineDefault =
    mode === 'stacked'
      ? clampPanel(viewportHeight * 0.5, 240, 480)
      : clampPanel((height - 12) / 2, timelineMin, timelineMax);
  return {
    mode,
    library,
    inspector,
    timeline: clampPanel(preferred.timeline ?? timelineDefault, timelineMin, timelineMax),
    previewMin,
    timelineMin,
    timelineDefault,
    libraryMax,
    inspectorMax: mode === 'wide' ? Math.min(480, width - library - 440 - 24) : inspectorMax,
    timelineMax,
  };
}
