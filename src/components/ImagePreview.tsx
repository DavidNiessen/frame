import { ImageToolbar } from './ImageToolbar';
import { CaptionPreview } from './CaptionPreview';
import { defaultGeometry } from '../core/geometry';
import { useElementSize } from '../hooks/useElementSize';
import { useRef, useState, type PointerEvent, type RefObject } from 'react';
import { ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { useImageRender } from '../hooks/useImageRender';
import { changeInstance, instanceRecipe } from '../core/effect-instances';
import { frameDimensions } from '../core/geometry';
import type { EffectId } from '../core/effect-library';
import type { Editor } from '../hooks/useEditor';
import { CropOverlay } from './CropOverlay';
import { PaintingCanvas } from './PaintingCanvas';
export function ImagePreview({
  editor,
  selectedEffect,
  expanded,
  toggleExpanded,
  openEffect,
  panelRef,
}: {
  panelRef: RefObject<HTMLElement | null>;
  editor: Editor;
  selectedEffect: { id: EffectId; instanceId?: string } | null;
  expanded: boolean;
  toggleExpanded: () => void;
  openEffect: (id: EffectId, instanceId?: string) => void;
}) {
  const viewport = useRef<HTMLDivElement>(null),
    bounds = useElementSize(viewport, { width: 640, height: 480 });
  const asset = editor.asset!,
    edit = editor.edit!,
    instance = edit.effectInstances?.find((item) => item.id === selectedEffect?.instanceId);
  const selected = instance ? instanceRecipe(edit, instance) : edit;
  const change = (patch: Partial<typeof edit>) =>
    editor.update(instance ? changeInstance(edit, instance.id, null, patch) : patch);
  const cropping = selectedEffect?.id === 'crop';
  const base = cropping
    ? instance
      ? {
          ...edit,
          effectInstances: edit.effectInstances?.slice(0, edit.effectInstances.indexOf(instance)),
        }
      : { ...edit, crop: null, geometry: defaultGeometry(), effectInstances: [] }
    : edit;
  const renderEdit = {
    ...base,
    subtitles: { mode: 'none' as const, cues: [] },
    ...(selectedEffect?.id === 'painting' && !instance ? { painting: undefined } : {}),
    effectInstances: base.effectInstances?.filter(
      (item) =>
        item.effect !== 'captions' &&
        !(selectedEffect?.id === 'painting' && item.id === instance?.id),
    ),
  };
  const render = useImageRender({ ...editor, edit: renderEdit });
  const [zoom, setZoom] = useState(1),
    [pan, setPan] = useState({ x: 0, y: 0 }),
    [before, setBefore] = useState(false);
  const drag = useRef<{ x: number; y: number; pan: typeof pan } | null>(null);
  const dims = before
      ? { width: asset.width!, height: asset.height! }
      : frameDimensions(asset, renderEdit),
    displayWidth = Math.max(
      1,
      Math.min(bounds.width - 48, ((bounds.height - 48) * dims.width) / dims.height),
    ),
    fit = () => {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    };
  function start(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || selectedEffect?.id === 'painting' || cropping || zoom === 1) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, pan };
  }
  const geometry = selected.geometry;
  return (
    <section
      id="media-preview"
      ref={panelRef}
      className="panel image-preview"
      aria-label="Image canvas"
      key={asset.id}
    >
      <ImageToolbar
        editor={editor}
        before={before}
        setBefore={setBefore}
        originalFailed={!render.original}
        expanded={expanded}
        toggleExpanded={toggleExpanded}
      />

      <div
        ref={viewport}
        className="image-viewport"
        onPointerDown={start}
        onPointerMove={(e) => {
          if (drag.current)
            setPan({
              x: drag.current.pan.x + e.clientX - drag.current.x,
              y: drag.current.pan.y + e.clientY - drag.current.y,
            });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onWheel={(e) => {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            setZoom((z) => Math.max(0.25, Math.min(8, z * (e.deltaY < 0 ? 1.1 : 0.9))));
          }
        }}
      >
        <div
          className="image-canvas-frame"
          style={{
            width: displayWidth,
            aspectRatio: `${dims.width}/${dims.height}`,
            transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`,
          }}
        >
          <img
            src={before ? render.original : render.url}
            alt={before ? 'Original image' : asset.name}
            draggable={false}
            onError={() => {
              if (before) {
                setBefore(false);
              }
            }}
          />
          {!cropping && !before && (
            <CaptionPreview
              outputPosition={0}
              current={0}
              asset={asset}
              edit={edit}
              disabled={!!editor.busy}
              pause={() => {}}
              update={editor.update}
              openEffect={openEffect}
              selectedEffect={selectedEffect}
            />
          )}
          {cropping && !before && (
            <CropOverlay
              crop={selected.crop ?? { x: 0, y: 0, width: dims.width, height: dims.height }}
              width={dims.width}
              height={dims.height}
              disabled={!!editor.busy}
              onChange={(crop) => change({ crop })}
            />
          )}
          {selectedEffect?.id === 'painting' && !before && (
            <PaintingCanvas
              showExisting
              edit={selected}
              update={change}
              width={dims.width}
              height={dims.height}
              disabled={!!editor.busy}
              onError={editor.setNotice}
            />
          )}
        </div>
        {before && <span className="image-original-badge">Original</span>}
      </div>
      <div className="image-status">
        <span title={asset.name}>
          {dims.width} × {dims.height} <span className="image-status-dot">·</span>{' '}
          {edit.format.toUpperCase()}
          {cropping
            ? ' · Drag the corners to crop'
            : selectedEffect?.id === 'painting'
              ? ' · Paint on the canvas'
              : ''}
        </span>
        <div className="image-toolbar-group">
          <button
            className="icon-button"
            aria-label="Zoom out image"
            disabled={zoom <= 0.25}
            onClick={() => setZoom((z) => Math.max(0.25, z / 1.25))}
          >
            <ZoomOut size={15} />
          </button>
          <span>{Math.round(((zoom * displayWidth) / dims.width) * 100)}%</span>
          <button
            className="icon-button"
            aria-label="Zoom in image"
            disabled={zoom >= 8}
            onClick={() => setZoom((z) => Math.min(8, z * 1.25))}
          >
            <ZoomIn size={15} />
          </button>
          <button
            className="button subtle small"
            aria-label="Actual image size"
            onClick={() => {
              setZoom(dims.width / displayWidth);
              setPan({ x: 0, y: 0 });
            }}
          >
            1:1
          </button>
          <button className="button subtle small" onClick={fit}>
            <Maximize size={13} /> Fit
          </button>
        </div>
      </div>
      {render.error && (
        <div className="image-render-error" role="alert">
          {render.error}
          <button className="button subtle small" onClick={render.retry}>
            Retry preview
          </button>
        </div>
      )}
      <span className="sr-only">Rotation {geometry.rotation} degrees</span>
    </section>
  );
}
