import type { ProjectDocument } from './project';
export const MAX_PROJECT_BYTES = 16 * 1024 * 1024;
const encoder = new TextEncoder();
/** Bound UTF-8 bytes before joining potentially large embedded artwork across sources. */
export function serializeProject(project: ProjectDocument, pretty = true): string {
  const header = JSON.stringify({ version: project.version, name: project.name, selectedSource: project.selectedSource }).slice(0, -1) + ',"sources":[';
  let bytes = encoder.encode(header).byteLength + 2;
  const sources: string[] = [];
  for (const source of project.sources) {
    const text = JSON.stringify(source); bytes += encoder.encode(text).byteLength + (sources.length ? 1 : 0);
    if (bytes > MAX_PROJECT_BYTES) throw new Error('This project exceeds 16 MB. Remove some embedded artwork or images, or save smaller workspaces.');
    sources.push(text);
  }
  const compact = header + sources.join(',') + ']}';
  if (!pretty) return compact;
  const formatted = JSON.stringify(project, null, 2);
  return encoder.encode(formatted).byteLength <= MAX_PROJECT_BYTES ? formatted : compact;
}
