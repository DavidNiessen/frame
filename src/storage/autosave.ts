import { parseAutosave, type AutosaveDocument } from '../core/autosave';
export interface RetainedMedia {
  blob: Blob;
  name: string;
  type: string;
  lastModified: number;
  relativePath?: string;
}
interface StoredWorkspace {
  document: AutosaveDocument;
  mediaIds: string[];
}
let database: Promise<IDBDatabase> | undefined;
function open(): Promise<IDBDatabase> {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('frame-workspace', 2);
    request.onupgradeneeded = () => {
      for (const name of ['autosave', 'media'])
        if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name);
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        database = undefined;
      };
      resolve(db);
    };
    request.onerror = () => {
      database = undefined;
      reject(new Error('Local storage is unavailable. Save your project manually.'));
    };
    request.onblocked = () => reject(new Error('Close older Frame tabs to enable autosave.'));
  });
  return database;
}
async function transaction<T>(
  mode: IDBTransactionMode,
  action: (tx: IDBTransaction, done: (result: T) => void) => void,
): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['autosave', 'media'], mode);
    let result: T;
    tx.oncomplete = () => resolve(result);
    tx.onabort = tx.onerror = () =>
      reject(
        new Error(
          'Could not retain this workspace. Check available storage and save a project manually.',
        ),
      );
    try {
      action(tx, (value) => {
        result = value;
      });
    } catch (error) {
      tx.abort();
      reject(error);
    }
  });
}
export async function readAutosave(): Promise<AutosaveDocument | null> {
  const value = await transaction<unknown>('readonly', (tx, done) => {
    const r = tx.objectStore('autosave').get('latest');
    r.onsuccess = () => done(r.result);
  });
  return value ? parseAutosave(value) : null;
}
export async function writeAutosave(value: AutosaveDocument): Promise<void> {
  const document = parseAutosave(value);
  await transaction<void>('readwrite', (tx) => {
    tx.objectStore('autosave').put(document, 'latest');
  });
}
export async function discardAutosave(): Promise<void> {
  await transaction<void>('readwrite', (tx) => {
    tx.objectStore('autosave').clear();
    tx.objectStore('media').clear();
  });
}
export async function writeRetainedWorkspace(
  document: AutosaveDocument,
  media: Map<string, RetainedMedia>,
): Promise<void> {
  const parsed = parseAutosave(document),
    mediaIds = [...media.keys()];
  if (mediaIds.length !== parsed.project.sources.length)
    throw new Error('The workspace is missing source media.');
  await transaction<void>('readwrite', (tx) => {
    const store = tx.objectStore('media'),
      keys = store.getAllKeys();
    keys.onsuccess = () => {
      const existing = new Set(keys.result);
      for (const [id, file] of media) if (!existing.has(id)) store.put(file, id);
      for (const key of existing) if (!media.has(String(key))) store.delete(key);
      tx.objectStore('autosave').put(
        { document: parsed, mediaIds } satisfies StoredWorkspace,
        'workspace',
      );
      tx.objectStore('autosave').delete('latest');
    };
  });
}
export async function readRetainedWorkspace(): Promise<{
  document: AutosaveDocument;
  mediaIds: string[];
  media: (RetainedMedia | undefined)[];
} | null> {
  return transaction('readonly', (tx, done) => {
    const r = tx.objectStore('autosave').get('workspace');
    r.onsuccess = () => {
      const value = r.result as StoredWorkspace | undefined;
      if (!value) {
        done(null);
        return;
      }
      try {
        const document = parseAutosave(value.document);
        if (
          !Array.isArray(value.mediaIds) ||
          value.mediaIds.length !== document.project.sources.length ||
          value.mediaIds.some((id) => typeof id !== 'string')
        )
          throw new Error('Invalid retained workspace.');
        const media: (RetainedMedia | undefined)[] = new Array(value.mediaIds.length);
        let remaining = media.length;
        value.mediaIds.forEach((id, index) => {
          const file = tx.objectStore('media').get(id);
          file.onsuccess = () => {
            media[index] = file.result;
            if (!--remaining) done({ document, mediaIds: value.mediaIds, media });
          };
        });
      } catch {
        tx.abort();
      }
    };
  });
}
