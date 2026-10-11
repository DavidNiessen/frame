/** Reduce background music using the actual dialogue signal, preserving foreground levels. */
export function duckMusicGraph(
  music: string[],
  dialogue: string[],
  prefix: string,
  duration: number,
) {
  if (!music.length || !dialogue.length) return { graph: [], labels: [...dialogue, ...music] };
  const sum = (count: number) =>
    `amix=inputs=${count}:duration=longest:dropout_transition=0:normalize=0`;
  // Align audio blocks and keep the detector alive beyond the music EOF. Otherwise
  // sidechain frame synchronization can intermittently discard buffered music at the tail.
  return {
    graph: [
      `${dialogue.join('')}${sum(dialogue.length)},asetnsamples=n=1024:p=1,apad=whole_dur=${duration + 1},asplit=2[${prefix}voice][${prefix}detector]`,
      `${music.join('')}${sum(music.length)},asetnsamples=n=1024:p=1[${prefix}music]`,
      `[${prefix}music][${prefix}detector]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400:knee=4:makeup=1:link=maximum:detection=rms[${prefix}ducked]`,
    ],
    labels: [`[${prefix}voice]`, `[${prefix}ducked]`],
  };
}
