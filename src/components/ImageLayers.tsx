import { Layers, Sparkles, Trash2 } from 'lucide-react';
import { appliedEffects, effectSummary, type EffectId } from '../core/effect-library';
import {
  changeInstance,
  definitionFor,
  extraInstances,
  instanceRecipe,
} from '../core/effect-instances';
import { effectAction } from '../core/effect-actions';
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
    instances = extraInstances(edit);
  const primary = appliedEffects(asset, { ...edit, effectInstances: [] }, null);
  const rows = [
    ...primary.map((effect) => ({ effect, recipe: edit, id: undefined as string | undefined })),
    ...instances.map((instance) => ({
      effect: definitionFor(instance.effect),
      recipe: instanceRecipe(edit, instance),
      id: instance.id,
    })),
  ];
  return (
    <section className="panel image-layers" aria-label="Image layers">
      <div className="panel-heading">
        <h2>
          <Layers size={16} /> Layers <span className="count">{rows.length}</span>
        </h2>
        <span className="field-note">Click to adjust</span>
      </div>
      <div className="image-layer-list">
        {rows.length ? (
          rows.map((row, index) => (
            <div
              className={`image-layer ${selectedEffect?.id === row.effect.id && selectedEffect.instanceId === row.id ? 'selected' : ''}`}
              key={row.id ?? row.effect.id}
            >
              <button disabled={!!editor.busy} onClick={() => openEffect(row.effect.id, row.id)}>
                <Sparkles size={14} />
                <span>
                  <strong>{row.effect.id === 'captions' ? 'Text' : row.effect.name}</strong>
                  <small>
                    {row.effect.id === 'captions'
                      ? row.recipe.subtitles.cues[0]?.text
                      : effectSummary(row.effect, row.recipe)}
                  </small>
                </span>
                <small>{index + 1}</small>
              </button>
              <button
                className="icon-button"
                aria-label={`Remove ${row.effect.name} layer ${index + 1}`}
                disabled={!!editor.busy}
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
          ))
        ) : (
          <p className="field-note">
            Add adjustments, text or paint from Effects. Your original image stays untouched.
          </p>
        )}
      </div>
    </section>
  );
}
