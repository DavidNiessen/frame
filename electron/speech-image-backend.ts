/** The speech bundle never processes images; Frame's image engine uses FFmpeg and dedicated codecs. */
export default function speechImageBackend(): never {
  throw new Error('The speech runtime only accepts audio samples.');
}
