import { FFFSType, type FFmpeg } from '@ffmpeg/ffmpeg';

/** WORKERFS reads Blob slices on demand instead of copying a whole movie into MEMFS. */
export function browserPreviewInput() {
  let resident: { ff: FFmpeg; file: File; path: string; mounted: boolean } | undefined;
  return {
    async open(ff: FFmpeg, file: File) {
      if (resident?.ff === ff && resident.file === file) return resident.path;
      if (resident?.ff === ff) {
        if (resident.mounted) await ff.unmount('/preview-input');
        else await ff.deleteFile(resident.path).catch(() => {});
      }
      await ff.createDir('/preview-input').catch(() => {});
      try {
        const mounted = await ff.mount(
          FFFSType.WORKERFS,
          { files: [new File([file], 'source')] },
          '/preview-input',
        );
        if (!mounted) throw new Error('File mounting is unavailable.');
        resident = { ff, file, path: '/preview-input/source', mounted: true };
      } catch {
        // Alternate FFmpeg cores can lack WORKERFS; keep them compatible.
        await ff.writeFile('joined-source', new Uint8Array(await file.arrayBuffer()));
        resident = { ff, file, path: 'joined-source', mounted: false };
      }
      return resident.path;
    },
    clear() {
      resident = undefined;
    },
  };
}
