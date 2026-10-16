import { FFFSType, type FFmpeg } from '@ffmpeg/ffmpeg';

/** Scoped, read-only Blob inputs. Multiple layers can share one mount per File. */
export function browserInputs(ff: FFmpeg) {
  const entries = new Map<File, Promise<{ path: string; cleanup: () => Promise<void> }>>();
  async function mount(file: File) {
    const root = `/frame-input-${crypto.randomUUID()}`;
    await ff.createDir(root);
    try {
      if (!(await ff.mount(FFFSType.WORKERFS, { files: [new File([file], 'source')] }, root)))
        throw new Error('File mounting is unavailable.');
      return {
        path: `${root}/source`,
        cleanup: async () => {
          await ff.unmount(root).catch(() => {});
          await ff.deleteDir(root).catch(() => {});
        },
      };
    } catch (error) {
      await ff.deleteDir(root).catch(() => {});
      // Cancellation destroys the worker; never copy a large file as a fallback
      // after it has already been cancelled.
      if (!ff.loaded) throw error;
      const path = root.slice(1);
      try {
        await ff.writeFile(path, new Uint8Array(await file.arrayBuffer()));
      } catch (error) {
        await ff.deleteFile(path).catch(() => {});
        throw error;
      }
      return {
        path,
        cleanup: async () => {
          await ff.deleteFile(path).catch(() => {});
        },
      };
    }
  }
  return {
    async open(file: File) {
      let pending = entries.get(file);
      if (!pending) {
        pending = mount(file);
        entries.set(file, pending);
      }
      return (await pending).path;
    },
    async cleanup() {
      const pending = [...entries.values()];
      entries.clear();
      for (const entry of pending) await entry.then((value) => value.cleanup()).catch(() => {});
    },
  };
}
