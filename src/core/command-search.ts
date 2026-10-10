export interface SearchableCommand { label: string; description: string; group: string; keywords?: string }
const normalize = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
/** Rank action names ahead of incidental matches in help text. Keep category order for an empty query. */
export function searchCommands<T extends SearchableCommand>(commands: T[], query: string): T[] {
  const text = normalize(query).trim().replace(/\s+/g, ' '), words = text.split(' ').filter(Boolean);
  if (!words.length) return commands;
  return commands.flatMap((command, order) => {
    const label = normalize(command.label), help = normalize(`${command.description} ${command.group} ${command.keywords ?? ''}`);
    if (!words.every(word => label.includes(word) || help.includes(word))) return [];
    const score = (label === text ? 1000 : label.includes(text) ? 100 : 0) + words.reduce((sum, word) => sum + (label.includes(word) ? 30 : 1), 0);
    return [{ command, score, order }];
  }).sort((a, b) => b.score - a.score || a.order - b.order).map(item => item.command);
}
