import { useEffect, useId, useRef } from 'react';
import { AudioLines, Trash2, X } from 'lucide-react';
import { allAudioLayers, updateAudioLayers } from '../core/effect-instances';
import { useInspectorOverlay } from '../hooks/useInspectorOverlay';
import type { Editor } from '../hooks/useEditor';
import { AudioLayerControls } from './AudioLayerControls';

export function AudioLayerOverlay({
  id,
  editor,
  close,
  keepView = false,
}: {
  id: string;
  editor: Editor;
  close: () => void;
  keepView?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    heading = useId(),
    bounds = useInspectorOverlay(ref, close, keepView);
  const layers = allAudioLayers(editor.edit!),
    layer = layers.find((item) => item.id === id),
    latestClose = useRef(close);
  latestClose.current = close;
  useEffect(() => {
    if (!layer) latestClose.current();
  }, [layer]);
  if (!layer) return null;
  return (
    <dialog
      open
      ref={ref}
      className="effect-settings-overlay audio-layer-overlay"
      style={bounds}
      aria-modal="false"
      aria-labelledby={heading}
    >
      <header className="effect-overlay-heading">
        <div>
          <span>
            <AudioLines size={14} />
            Audio layer
          </span>
          <h2 id={heading}>Audio layer settings</h2>
          <p title={layer.source.name}>{layer.source.name}</p>
        </div>
        <button
          data-close
          className="icon-button"
          aria-label="Close audio layer settings"
          onClick={close}
        >
          <X size={18} />
        </button>
      </header>
      <div className="effect-overlay-body">
        <fieldset disabled={!!editor.busy}>
          <AudioLayerControls editor={editor} layer={layer} />
        </fieldset>
      </div>
      <footer className="effect-overlay-footer">
        <button
          className="button subtle small danger"
          disabled={!!editor.busy}
          onClick={() => {
            editor.update(
              updateAudioLayers(
                editor.edit!,
                layers.filter((item) => item.id !== id),
              ),
            );
            close();
          }}
        >
          <Trash2 size={14} />
          Remove layer
        </button>
        <button className="button primary small" onClick={close}>
          Done
        </button>
      </footer>
    </dialog>
  );
}
