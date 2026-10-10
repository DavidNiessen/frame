/** Reduce background music using the actual dialogue signal, preserving foreground levels. */
export function duckMusicGraph(music: string[], dialogue: string[], prefix: string) {
  if (!music.length || !dialogue.length) return { graph: [], labels: [...dialogue, ...music] };
  const sum = (count: number) => `amix=inputs=${count}:duration=longest:dropout_transition=0:normalize=0`;
  return { graph: [
    `${dialogue.join('')}${sum(dialogue.length)},asplit=2[${prefix}voice][${prefix}detector]`,
    `${music.join('')}${sum(music.length)}[${prefix}music]`,
    `[${prefix}music][${prefix}detector]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400:knee=4:makeup=1:link=maximum:detection=rms[${prefix}ducked]`,
  ], labels: [`[${prefix}voice]`, `[${prefix}ducked]`] };
}
