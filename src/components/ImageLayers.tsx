import { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  FolderPlus,
  Layers,
  Lock,
  Pencil,
  Sparkles,
  Trash2,
  Unlock,
} from 'lucide-react';
import { effectSummary, type EffectId } from '../core/effect-library';
import { changeInstance } from '../core/effect-instances';
import { effectAction } from '../core/effect-actions';
import {
  changeImageLayer,
  emptyImageLayers,
  imageLayerRows,
  moveImageLayer,
  type ImageLayerGroup,
} from '../core/image-layers';
import type { Editor } from '../hooks/useEditor';
export function ImageLayers({
  editor,
  openEffect,
  selectedEffect,
}: {
  selectedEffect: { id: EffectId; instanceId?: string } | null;
  editor: Editor;
  openEffect: (id: EffectId, instance?: string) => void;
}) {
  const asset = editor.asset!,
    edit = editor.edit!,
    rows = imageLayerRows(asset, edit),
    stack = edit.imageLayers ?? emptyImageLayers();
  const [chosen, setChosen] = useState<string[]>([]),
    [renaming, setRenaming] = useState<string | null>(null);
  const blocked = !!editor.busy;
  const changeGroup = (id: string, patch: Partial<ImageLayerGroup>) =>
    editor.update({
      imageLayers: {
        ...stack,
        groups: stack.groups.map((g) => (g.id === id ? { ...g, ...patch } : g)),
      },
    });
  const group = () => {
    const keys = chosen.filter((key) => rows.some((r) => r.key === key && !r.fixed && !r.locked));
    if (keys.length < 2 || stack.groups.length >= 100) return;
    const id = crypto.randomUUID();
    const ordered = rows.filter((row) => !row.fixed).map((row) => row.key);
    const anchor = Math.max(...keys.map((key) => ordered.indexOf(key)));
    const order = [
      ...ordered.slice(0, anchor + 1).filter((key) => !keys.includes(key)),
      ...ordered.filter((key) => keys.includes(key)),
      ...ordered.slice(anchor + 1),
    ];
    editor.update({
      imageLayers: {
        ...stack,
        order,
        entries: {
          ...stack.entries,
          ...Object.fromEntries(keys.map((key) => [key, { ...stack.entries[key], group: id }])),
        },
        groups: [
          ...stack.groups,
          {
            id,
            name: `Group ${stack.groups.length + 1}`,
            hidden: false,
            locked: false,
            collapsed: false,
          },
        ],
      },
    });
    setChosen([]);
  };
  const rowView = (row: (typeof rows)[number], index: number) => {
    const name = row.state.name ?? (row.effect.id === 'captions' ? 'Text' : row.effect.name),
      selected = selectedEffect?.id === row.effect.id && selectedEffect.instanceId === row.id;
    return (
      <div
        className={`image-layer ${selected ? 'selected' : ''}`}
        data-hidden={row.hidden || undefined}
        key={row.key}
      >
        <div className="image-layer-main">
          {!row.fixed && (
            <input
              type="checkbox"
              aria-label={`Select ${name} layer ${index + 1}`}
              checked={chosen.includes(row.key)}
              disabled={blocked || row.locked}
              onChange={(e) =>
                setChosen((v) =>
                  e.target.checked ? [...v, row.key] : v.filter((k) => k !== row.key),
                )
              }
            />
          )}
          <button
            className="image-layer-open"
            disabled={blocked || row.locked}
            onClick={() => openEffect(row.effect.id, row.id)}
          >
            <Sparkles size={14} />
            <span>
              <strong>{name}</strong>
              <small>
                {row.effect.id === 'captions'
                  ? row.recipe.subtitles.cues[0]?.text
                  : effectSummary(row.effect, row.recipe)}
              </small>
            </span>
          </button>
          <button
            className="icon-button"
            title={
              row.fixed ? 'Canvas geometry stays visible' : row.hidden ? 'Show layer' : 'Hide layer'
            }
            aria-label={`${row.hidden ? 'Show' : 'Hide'} ${name} layer ${index + 1}`}
            disabled={blocked || row.fixed || row.locked}
            onClick={() =>
              editor.update(changeImageLayer(edit, row.key, { hidden: !row.state.hidden }))
            }
          >
            {row.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
          <button
            className="icon-button"
            aria-label={`${row.locked ? 'Unlock' : 'Lock'} ${name} layer ${index + 1}`}
            disabled={blocked || row.group?.locked}
            onClick={() =>
              editor.update(changeImageLayer(edit, row.key, { locked: !row.state.locked }))
            }
          >
            {row.locked ? <Lock size={14} /> : <Unlock size={14} />}
          </button>
        </div>
        <div className="image-layer-actions">
          {renaming === row.key ? (
            <input
              autoFocus
              aria-label="Layer name"
              defaultValue={name}
              maxLength={80}
              onBlur={(e) => {
                const name = e.target.value.trim();
                if (name) editor.update(changeImageLayer(edit, row.key, { name }));
                setRenaming(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') setRenaming(null);
              }}
            />
          ) : (
            <button
              className="button subtle small"
              aria-label={`Rename ${name} layer ${index + 1}`}
              disabled={blocked || row.locked}
              onClick={() => setRenaming(row.key)}
            >
              <Pencil size={12} />
              Rename
            </button>
          )}
          {!row.fixed && (
            <>
              <button
                className="icon-button"
                aria-label={`Raise ${name} layer ${index + 1}`}
                disabled={blocked || row.locked || index === rows.length - 1}
                onClick={() => editor.update(moveImageLayer(asset, edit, row.key, 1))}
              >
                <ArrowUp size={14} />
              </button>
              <button
                className="icon-button"
                aria-label={`Lower ${name} layer ${index + 1}`}
                disabled={blocked || row.locked || !rows.slice(0, index).some((r) => !r.fixed)}
                onClick={() => editor.update(moveImageLayer(asset, edit, row.key, -1))}
              >
                <ArrowDown size={14} />
              </button>
            </>
          )}
          {row.state.group && (
            <button
              className="button subtle small"
              disabled={blocked || row.locked}
              onClick={() => editor.update(changeImageLayer(edit, row.key, { group: undefined }))}
            >
              Ungroup
            </button>
          )}
          <button
            className="icon-button danger"
            aria-label={`Remove ${row.effect.name} layer ${index + 1}`}
            disabled={blocked || row.locked}
            onClick={() =>
              editor.update(
                row.id
                  ? changeInstance(edit, row.id, null, 'remove')
                  : effectAction(edit, asset, row.effect, null, 'remove'),
              )
            }
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    );
  };
  const seen = new Set<string>();
  const blocks = rows
    .slice()
    .reverse()
    .flatMap((row) => {
      if (!row.group) return [{ row, group: undefined as ImageLayerGroup | undefined }];
      if (seen.has(row.group.id)) return [];
      seen.add(row.group.id);
      return [{ row, group: row.group }];
    });
  return (
    <section className="panel image-layers" aria-label="Image layers">
      <div className="panel-heading">
        <h2>
          <Layers size={16} />
          Layers <span className="count">{rows.length}</span>
        </h2>
        <button
          className="button subtle small"
          disabled={blocked || chosen.length < 2}
          onClick={group}
        >
          <FolderPlus size={14} />
          Group selected
        </button>
      </div>
      <div className="image-layer-list">
        {blocks.map(({ row, group: g }) =>
          g ? (
            <div className="image-layer-group" key={g.id}>
              <div className="image-group-heading">
                <button
                  className="icon-button"
                  aria-label={`${g.collapsed ? 'Expand' : 'Collapse'} ${g.name}`}
                  onClick={() => changeGroup(g.id, { collapsed: !g.collapsed })}
                >
                  {g.collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                </button>
                <input
                  aria-label="Group name"
                  value={g.name}
                  maxLength={80}
                  disabled={blocked || g.locked}
                  onChange={(e) => {
                    if (e.target.value.trim()) changeGroup(g.id, { name: e.target.value });
                  }}
                />
                <button
                  className="icon-button"
                  aria-label={`${g.hidden ? 'Show' : 'Hide'} ${g.name}`}
                  disabled={blocked || g.locked}
                  onClick={() => changeGroup(g.id, { hidden: !g.hidden })}
                >
                  {g.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <button
                  className="icon-button"
                  aria-label={`${g.locked ? 'Unlock' : 'Lock'} ${g.name}`}
                  disabled={blocked}
                  onClick={() => changeGroup(g.id, { locked: !g.locked })}
                >
                  {g.locked ? <Lock size={14} /> : <Unlock size={14} />}
                </button>
              </div>
              {!g.collapsed &&
                rows
                  .filter((r) => r.state.group === g.id)
                  .slice()
                  .reverse()
                  .map((row) => rowView(row, rows.indexOf(row)))}
            </div>
          ) : (
            rowView(row, rows.indexOf(row))
          ),
        )}
        {!rows.length && (
          <p className="field-note">
            Add adjustments, text or paint from Effects. Your original image stays untouched.
          </p>
        )}
      </div>
    </section>
  );
}
