import { SlidersHorizontal, RotateCcw } from 'lucide-react';
import { ExportFooter } from './ExportFooter';
import { InspectorTabs, type InspectorTab } from './InspectorTabs';
import type { Editor } from '../hooks/useEditor';
import { DesktopControls } from './DesktopControls';
import type { Proxies } from '../hooks/useProxies';
import { EffectLibrary } from './EffectLibrary';
import { EffectScope } from './EffectScope';
import { ExportControls } from './ExportControls';
export function Inspector({ editor, seek, proxies, tab, setTab }: { tab: InspectorTab; setTab: (tab: InspectorTab) => void; proxies: Proxies; editor: Editor; seek: (time: number) => void }) {
  const { asset, edit, busy } = editor;
  return <aside id="media-inspector" className="inspector panel"><div className="panel-heading"><h2><SlidersHorizontal size={16} /> Effects & export</h2>{asset && <button className="icon-button" aria-label="Reset all edits" disabled={!!busy} onClick={editor.reset}><RotateCcw size={15} /></button>}</div>
    {!asset || !edit ? <div className="inspector-empty"><span className="empty-controls" aria-hidden="true"><i /><i /><i /></span><h3>A few thoughtful adjustments.</h3><p>Choose a file to trim, crop, adjust its volume, or make it something new.</p><div className="supported-formats"><span>VIDEO</span><p>MP4 · MOV · WebM · MKV · GIF</p><span>AUDIO</span><p>MP3 · WAV · FLAC · OGG · M4A</p></div></div> : <>
      <EffectScope editor={editor} seek={seek} />
      <InspectorTabs selected={tab} select={setTab}>{ {
        effects: <fieldset disabled={!!busy}><EffectLibrary editor={editor} /></fieldset>,
        export: <fieldset disabled={!!busy}><ExportControls asset={asset} edit={edit} update={editor.update} /><DesktopControls editor={editor} proxies={proxies} /></fieldset>,
      } }</InspectorTabs>
      <ExportFooter editor={editor} />
    </>}
  </aside>;
}
