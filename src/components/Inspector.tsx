import type { EffectId } from '../core/effect-library';
import { SlidersHorizontal } from 'lucide-react';
import { ExportFooter } from './ExportFooter';
import { InspectorTabs, type InspectorTab } from './InspectorTabs';
import type { Editor } from '../hooks/useEditor';
import { DesktopControls } from './DesktopControls';
import type { Proxies } from '../hooks/useProxies';
import { EffectLibrary } from './EffectLibrary';
import { EffectScope } from './EffectScope';
import { ExportControls } from './ExportControls';
export function Inspector({
  editor,
  current,
  seek,
  proxies,
  tab,
  setTab,
  openCaption,
  openEffect,
}: {
  tab: InspectorTab;
  setTab: (tab: InspectorTab) => void;
  current: number;
  proxies: Proxies;
  editor: Editor;
  seek: (time: number) => void;
  openCaption: (instanceId?: string) => void;
  openEffect: (id: EffectId, instanceId?: string) => void;
}) {
  const { asset, edit, busy } = editor;
  return (
    <aside id="media-inspector" className="inspector panel">
      <div className="panel-heading">
        <h2>
          <SlidersHorizontal size={16} /> Effects & export
        </h2>
      </div>
      {!asset || !edit ? (
        <div className="inspector-empty">
          <span className="empty-controls" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <h3>A few thoughtful adjustments.</h3>
          <p>Choose an image, video or audio file to edit or convert.</p>
          <div className="supported-formats">
            <span>IMAGES</span>
            <p>PNG · JPEG · WebP · TIFF · HEIC · RAW</p>
            <span>VIDEO</span>
            <p>MP4 · MOV · WebM · MKV · GIF</p>
            <span>AUDIO</span>
            <p>MP3 · WAV · FLAC · OGG · M4A</p>
          </div>
        </div>
      ) : (
        <>
          {asset.kind !== 'image' && <EffectScope editor={editor} seek={seek} />}
          <InspectorTabs selected={tab} select={setTab}>
            {{
              effects: (
                <fieldset disabled={!!busy}>
                  <EffectLibrary
                    openEffect={openEffect}
                    current={current}
                    seek={seek}
                    openCaption={openCaption}
                    editor={editor}
                  />
                </fieldset>
              ),
              export: (
                <fieldset disabled={!!busy}>
                  <ExportControls asset={asset} edit={edit} update={editor.update} />
                  {asset.kind !== 'image' && <DesktopControls editor={editor} proxies={proxies} />}
                </fieldset>
              ),
            }}
          </InspectorTabs>
          <ExportFooter editor={editor} />
        </>
      )}
    </aside>
  );
}
