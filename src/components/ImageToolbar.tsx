import { CanvasGuidesMenu } from './CanvasGuidesMenu';
import {
  Expand,
  Eye,
  RotateCcw,
  RotateCw,
  Undo2,
  Redo2,
  FlipHorizontal,
  FlipVertical,
} from 'lucide-react';
import type { Editor } from '../hooks/useEditor';
export function ImageToolbar({
  editor,
  before,
  setBefore,
  originalFailed,
  expanded,
  toggleExpanded,
}: {
  editor: Editor;
  before: boolean;
  setBefore: (value: boolean) => void;
  originalFailed: boolean;
  expanded: boolean;
  toggleExpanded: () => void;
}) {
  const edit = editor.edit!;
  return (
    <div className="image-toolbar">
      <div className="image-toolbar-group">
        <button
          className="icon-button"
          title="Undo"
          aria-label="Undo image edit"
          disabled={!editor.canUndo || !!editor.busy}
          onClick={editor.undo}
        >
          <Undo2 size={16} />
        </button>
        <button
          className="icon-button"
          title="Redo"
          aria-label="Redo image edit"
          disabled={!editor.canRedo || !!editor.busy}
          onClick={editor.redo}
        >
          <Redo2 size={16} />
        </button>
        <span className="toolbar-separator" />
        <button
          className="icon-button"
          aria-label="Rotate image left"
          disabled={!!editor.busy}
          onClick={() =>
            editor.update({
              geometry: {
                ...edit.geometry,
                rotation: ((edit.geometry.rotation + 270) % 360) as 0 | 90 | 180 | 270,
              },
            })
          }
        >
          <RotateCcw size={16} />
        </button>
        <button
          className="icon-button"
          aria-label="Rotate image right"
          disabled={!!editor.busy}
          onClick={() =>
            editor.update({
              geometry: {
                ...edit.geometry,
                rotation: ((edit.geometry.rotation + 90) % 360) as 0 | 90 | 180 | 270,
              },
            })
          }
        >
          <RotateCw size={16} />
        </button>
        <button
          className="icon-button"
          aria-label="Flip image horizontally"
          disabled={!!editor.busy}
          onClick={() =>
            editor.update({
              geometry: { ...edit.geometry, flipHorizontal: !edit.geometry.flipHorizontal },
            })
          }
        >
          <FlipHorizontal size={16} />
        </button>
        <button
          className="icon-button"
          aria-label="Flip image vertically"
          disabled={!!editor.busy}
          onClick={() =>
            editor.update({
              geometry: { ...edit.geometry, flipVertical: !edit.geometry.flipVertical },
            })
          }
        >
          <FlipVertical size={16} />
        </button>
      </div>
      <div className="image-toolbar-group">
        <CanvasGuidesMenu />
        <button
          className="button subtle small"
          aria-pressed={before}
          disabled={originalFailed}
          onClick={() => setBefore(!before)}
        >
          <Eye size={14} />
          {before ? 'Original' : 'Before / after'}
        </button>
        <button
          className="icon-button"
          data-preview-expand
          aria-label={expanded ? 'Restore image canvas' : 'Expand image canvas'}
          aria-pressed={expanded}
          onClick={toggleExpanded}
        >
          <Expand size={16} />
        </button>
      </div>
    </div>
  );
}
