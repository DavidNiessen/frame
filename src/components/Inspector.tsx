import { SlidersHorizontal, RotateCcw } from 'lucide-react';
import { AppliedEffects } from './AppliedEffects';
import { ExportFooter } from './ExportFooter';
import { InspectorTabs, type InspectorTab } from './InspectorTabs';
import type { Editor } from '../hooks/useEditor';
import { DesktopControls } from './DesktopControls';
import type { Proxies } from '../hooks/useProxies';
import { EffectLibrary } from './EffectLibrary';
import { EffectRecipes } from './EffectRecipes';
import { EffectScope } from './EffectScope';
import { EditControls } from './EditControls';
import { ExportControls } from './ExportControls';
export function Inspector({ editor, current, seek, proxies, tab, setTab }: { tab: InspectorTab; setTab: (tab: InspectorTab) => void; proxies: Proxies; editor: Editor; current: number; seek: (time: number) => void }) {
  const { asset, edit, busy } = editor;
  return <aside id="media-inspector" className="inspector panel"><div className="panel-heading"><h2><SlidersHorizontal size={16} /> Edit & export</h2>{asset && <button className="icon-button" aria-label="Reset all edits" disabled={!!busy} onClick={editor.reset}><RotateCcw size={15} /></button>}</div>
    {!asset || !edit ? <div className="inspector-empty"><span className="empty-controls" aria-hidden="true"><i /><i /><i /></span><h3>A few thoughtful adjustments.</h3><p>Choose a file to trim, crop, adjust its volume, or make it something new.</p><div className="supported-formats"><span>VIDEO</span><p>MP4 · MOV · WebM · MKV · GIF</p><span>AUDIO</span><p>MP3 · WAV · FLAC · OGG · M4A</p></div></div> : <>
      <EffectScope editor={editor} seek={seek} />
      <InspectorTabs selected={tab} select={setTab}>{ {
        edit: <fieldset disabled={!!busy}><EditControls asset={asset} edit={editor.scopedEdit!} update={editor.updateClip} current={current} /><AppliedEffects asset={asset} edit={edit} open={() => setTab('effects')} /></fieldset>,
        effects: <fieldset disabled={!!busy}><EffectRecipes editor={editor} /><EffectLibrary editor={editor} current={current} seek={seek} /></fieldset>,
        export: <fieldset disabled={!!busy}><ExportControls asset={asset} edit={edit} update={editor.update} /><DesktopControls editor={editor} proxies={proxies} /></fieldset>,
      } }</InspectorTabs>
      <ExportFooter editor={editor} />
    </>}
  </aside>;
}
