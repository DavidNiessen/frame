import { parseProject, type ProjectDocument } from './project';
export const MAX_AUTOSAVE_BYTES = 16 * 1024 * 1024;
export interface AutosaveDocument { version: 1; savedAt: number; project: ProjectDocument }
export function parseAutosave(value: unknown): AutosaveDocument {
  const s = value as AutosaveDocument;
  if (!s || s.version !== 1 || !Number.isFinite(s.savedAt) || s.savedAt <= 0 || JSON.stringify(s).length > MAX_AUTOSAVE_BYTES) throw new Error('The previous autosave is invalid or too large.');
  return { version: 1, savedAt: s.savedAt, project: parseProject(s.project) };
}
