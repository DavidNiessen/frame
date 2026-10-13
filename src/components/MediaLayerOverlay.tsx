import { MediaLayerAnimation } from './MediaLayerAnimation';
import { useEffect, useId, useRef } from 'react';
import { Layers, Trash2, X, Lock, Unlock } from 'lucide-react';
import { useInspectorOverlay } from '../hooks/useInspectorOverlay';
import { changeMediaLayer, removeMediaLayer } from '../core/media-layers';
import { mediaLayerKey } from '../core/image-layers';
import { ImageLayerCompositing } from './ImageLayerCompositing';
import { MediaLayerControls } from './MediaLayerControls';
import type { Editor } from '../hooks/useEditor';
export function MediaLayerOverlay({
  id,
  editor,
  close,
  keepView = false,
  current,
  seek,
}: {
  id: string;
  current: number;
  seek: (output: number) => void;
  editor: Editor;
  close: () => void;
  keepView?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    heading = useId(),
    bounds = useInspectorOverlay(ref, close, keepView),
    layer = editor.edit?.mediaLayers?.find((l) => l.id === id),
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
      className="effect-settings-overlay media-layer-overlay"
      style={bounds}
      aria-modal="false"
      aria-labelledby={heading}
    >
      <header className="effect-overlay-heading">
        <div>
          <span>
            <Layers size={14} />
            {layer.source.kind === 'image' ? 'Image' : 'Video'} layer
          </span>
          <h2 id={heading}>Media layer settings</h2>
          <p title={layer.source.name}>{layer.source.name}</p>
        </div>
        <button
          data-close
          className="icon-button"
          aria-label="Close media layer settings"
          onClick={close}
        >
          <X size={18} />
        </button>
      </header>
      <div className="effect-overlay-body">
        <fieldset disabled={!!editor.busy || layer.locked}>
          {editor.asset?.kind === 'image' && (
            <ImageLayerCompositing
              editor={editor}
              id="media"
              layerKey={mediaLayerKey(id)}
              opacityControl={false}
            />
          )}
          <MediaLayerControls editor={editor} layer={layer} current={current} />
          <MediaLayerAnimation editor={editor} layer={layer} current={current} seek={seek} />
        </fieldset>
      </div>
      <footer className="effect-overlay-footer">
        <button
          className="button subtle small"
          disabled={!!editor.busy}
          onClick={() =>
            editor.update(changeMediaLayer(editor.edit!, id, { locked: !layer.locked }))
          }
        >
          {layer.locked ? <Unlock size={14} /> : <Lock size={14} />}{' '}
          {layer.locked ? 'Unlock' : 'Lock'} layer
        </button>
        <button
          className="button subtle small danger"
          disabled={!!editor.busy || layer.locked}
          onClick={() => {
            editor.update(removeMediaLayer(editor.edit!, id));
            close();
          }}
        >
          <Trash2 size={14} />
          Remove layer
        </button>
      </footer>
    </dialog>
  );
}
