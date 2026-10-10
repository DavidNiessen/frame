import { changeInstance, sourceRecipes } from './effect-instances';
import type { EditSettings } from './types';
import type { SubtitleCue } from './subtitles';
export function captionItems(edit: EditSettings) {
  let index = 0;
  return sourceRecipes(edit, 'captions').flatMap(({ id, recipe }) => recipe.subtitles.cues.map((cue, localIndex) => ({ ...cue, cue, index: index++, localIndex, instanceId: id, mode: recipe.subtitles.mode })));
}
export function changeCaption(edit: EditSettings, item: ReturnType<typeof captionItems>[number], patch: Partial<SubtitleCue> | 'remove'): Partial<EditSettings> {
  const subtitles = sourceRecipes(edit, 'captions').find(recipe => recipe.id === item.instanceId)!.recipe.subtitles;
  const cues = subtitles.cues.flatMap((cue, index) => index !== item.localIndex ? [cue] : patch === 'remove' ? [] : [{ ...cue, ...patch }]);
  const value = { subtitles: { ...subtitles, cues } };
  return item.instanceId ? changeInstance(edit, item.instanceId, null, value) : value;
}
