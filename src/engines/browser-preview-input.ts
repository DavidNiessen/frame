import type { FFmpeg } from '@ffmpeg/ffmpeg';
import { browserInputs } from './browser-inputs';

/** WORKERFS reads Blob slices on demand instead of copying a whole movie into MEMFS. */
export function browserPreviewInput() {
  let resident:
    { ff: FFmpeg; file: File; path: string; inputs: ReturnType<typeof browserInputs> } | undefined;
  return {
    async open(ff: FFmpeg, file: File) {
      if (resident?.ff === ff && resident.file === file) return resident.path;
      await resident?.inputs.cleanup();
      resident = undefined;
      const inputs = browserInputs(ff);
      try {
        const path = await inputs.open(file);
        resident = { ff, file, path, inputs };
        return path;
      } catch (error) {
        await inputs.cleanup();
        throw error;
      }
    },
    clear() {
      const previous = resident;
      resident = undefined;
      void previous?.inputs.cleanup();
    },
  };
}
