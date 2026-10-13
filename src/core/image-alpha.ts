/** Some FFmpeg filters negotiate a format without alpha. Preserve the input mask explicitly. */
export function preserveImageAlpha(filters: string[], prefix: string): string[] {
  return filters.map((filter, index) => {
    if (!/^(vignette|edgedetect)=/.test(filter)) return filter;
    const id = `${prefix.replace(/[^a-z0-9]/gi, '')}${index}`;
    return `format=rgba,split[visual${id}][masksource${id}];[masksource${id}]alphaextract[mask${id}];[visual${id}]${filter},format=rgb24[adjusted${id}];[adjusted${id}][mask${id}]alphamerge`;
  });
}
