import { useImperativeHandle, useRef, type CSSProperties, type ReactNode, type Ref } from 'react';
import { defaultPanelSizes, editorPanelLayout } from '../../core/panel-layout';
import { usePanelSizes } from '../../hooks/usePanelSizes';
import { useElementSize } from '../../hooks/useElementSize';
import { PanelDivider } from './PanelDivider';
export interface WorkspaceLayout { reset: () => void }
interface Props { ref?: Ref<WorkspaceLayout>; library: ReactNode; inspector: ReactNode; preview: ReactNode; timeline: ReactNode; empty: ReactNode; hasMedia: boolean; expanded?: boolean }
export function EditorWorkspace({ ref, library, inspector, preview, timeline, empty, hasMedia, expanded = false }: Props) {
  const root = useRef<HTMLElement>(null), center = useRef<HTMLDivElement>(null);
  const { sizes, resize, reset } = usePanelSizes();
  useImperativeHandle(ref, () => ({ reset }), [reset]);
  const bounds = useElementSize(root, { width: innerWidth - 32, height: innerHeight - 190 });
  const content = useElementSize(center, { width: innerWidth - 590, height: Math.max(552, innerHeight - 190) });
  const layout = editorPanelLayout(sizes, bounds.width, content.height, innerHeight);
  const style = { '--library-width': `${layout.library}px`, '--inspector-width': `${layout.inspector}px`, '--timeline-height': `${layout.timeline}px` } as CSSProperties;
  return <main ref={root} className="workspace editor-layout" data-layout={layout.mode} data-expanded={expanded || undefined} style={style}>
    {library}
    <div className="library-divider"><PanelDivider label="Resize media library" controls="media-library" axis="x" value={layout.library} min={180} max={layout.libraryMax} defaultValue={defaultPanelSizes.library} resize={value => resize('library', value)} /></div>
    <div ref={center} className={`editor-center ${hasMedia ? 'has-media' : ''}`}>
      {hasMedia ? <>{preview}<PanelDivider label="Resize timeline" controls="media-timeline" axis="y" reverse value={layout.timeline} min={180} max={layout.timelineMax} defaultValue={layout.timelineDefault} resize={value => resize('timeline', value)} />{timeline}</> : empty}
    </div>
    <div className="inspector-divider"><PanelDivider label="Resize edit and export panel" controls="media-inspector" axis="x" reverse value={layout.inspector} min={280} max={layout.inspectorMax} defaultValue={defaultPanelSizes.inspector} resize={value => resize('inspector', value)} /></div>
    {inspector}
  </main>;
}
