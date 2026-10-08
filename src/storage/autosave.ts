import { parseAutosave, type AutosaveDocument } from '../core/autosave';
let database: Promise<IDBDatabase> | undefined;
function open(): Promise<IDBDatabase> {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('frame-workspace', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('autosave');
    request.onsuccess = () => { const db = request.result; db.onversionchange = () => { db.close(); database = undefined; }; resolve(db); };
    request.onerror = () => { database = undefined; reject(new Error('Local storage is unavailable. Save your project manually.')); };
    request.onblocked = () => reject(new Error('Close older Frame tabs to enable autosave.'));
  }); return database;
}
async function transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open(); return new Promise((resolve, reject) => {
    const tx = db.transaction('autosave', mode); const request = action(tx.objectStore('autosave')); let result: T;
    request.onsuccess = () => { result = request.result; };
    tx.oncomplete = () => resolve(result); tx.onabort = tx.onerror = () => reject(new Error('Could not persist autosave. Check available storage and save a project manually.'));
  });
}
export async function readAutosave(): Promise<AutosaveDocument | null> { const value = await transaction('readonly', store => store.get('latest')); return value ? parseAutosave(value) : null; }
export async function writeAutosave(value: AutosaveDocument): Promise<void> { await transaction('readwrite', store => store.put(parseAutosave(value), 'latest')); }
export async function discardAutosave(): Promise<void> { await transaction('readwrite', store => store.delete('latest')); }
