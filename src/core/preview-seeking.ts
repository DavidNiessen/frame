import type { EditSettings } from './types';
import { keptRanges } from './timeline';

/** Decode short retained excerpts instead of the discarded envelope between them. */
export function seekPreviewClips(plan: string[], edit: EditSettings, input: string) {
  const clips = edit.clips ?? keptRanges(edit),
    graph = plan.indexOf('-filter_complex'),
    firstInput = plan.indexOf('-i'),
    seek = plan.indexOf('-ss'),
    limit = plan.indexOf('-t');
  // Bound decoder instances. Large assemblies retain the shared-input path.
  if (
    clips.length < 2 ||
    clips.length > 8 ||
    graph < 0 ||
    plan[firstInput + 1] !== input ||
    seek < 0 ||
    seek > firstInput ||
    limit < 0 ||
    limit > firstInput
  )
    return plan;
  // A contiguous forward read already decodes just the retained footage.
  if (
    clips.every(
      (clip, index) => Math.abs(clip.start - (index ? clips[index - 1].end : edit.start)) < 1e-8,
    )
  )
    return plan;
  const inputCount = plan.filter((value) => value === '-i').length;
  let filters = plan[graph + 1];
  const extra: string[] = [];
  for (const [index, clip] of clips.entries()) {
    const trim = `start=${clip.start - edit.start}:end=${clip.end - edit.start}`,
      video = `[0:V:0]trim=${trim},`,
      audio = `[0:a:0]atrim=${trim},`,
      source = index ? inputCount + index - 1 : 0,
      duration = clip.end - clip.start;
    if (!filters.includes(video) && !filters.includes(audio)) return plan;
    filters = filters
      .replace(video, `[${source}:V:0]trim=duration=${duration},`)
      .replace(audio, `[${source}:a:0]atrim=duration=${duration},`);
    if (index)
      extra.push('-ss', String(clip.start), '-t', String(duration), '-threads', '1', '-i', input);
  }
  const result = [...plan];
  result[graph + 1] = filters;
  result[seek + 1] = String(clips[0].start);
  result[limit + 1] = String(clips[0].end - clips[0].start);
  result.splice(firstInput, 0, '-threads', '1');
  // Append after existing audio/layer inputs so their indices remain stable.
  result.splice(result.lastIndexOf('-i') + 2, 0, ...extra);
  return result;
}
