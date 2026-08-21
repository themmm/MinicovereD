import type { Project } from './project-file.ts';
import { readProjectFile, writeProjectFile } from './project-file.ts';

/**
 * Autosave. Everything lives in the browser and nowhere else (ADR-0001), so
 * losing it to a reload would lose it for good.
 *
 * The project is stored as the same JSON a project file holds, which means the
 * autosave and the export are one format with one reader — a restored project
 * gets the same validation an imported file does, and a store written by an
 * older version comes back through the same upgrade path.
 */

export interface ProjectStore {
  load(): Promise<Project | undefined>;
  save(project: Project): Promise<void>;
  clear(): Promise<void>;
}

const DATABASE = 'mdcovergen';
const STORE = 'project';
const KEY = 'current';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB could not be opened'));
  });
}

function transact<T>(
  database: IDBDatabase,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, mode);
    const request = run(transaction.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

export function createIndexedDbStore(): ProjectStore {
  return {
    async load() {
      const database = await open();
      try {
        const text = await transact<unknown>(database, 'readonly', (store) => store.get(KEY));
        if (typeof text !== 'string') return undefined;

        const result = readProjectFile(text);
        // Autosaved state that will not parse is state this version cannot use.
        // Reporting it as absent is better than refusing to start.
        return result.ok ? result.project : undefined;
      } finally {
        database.close();
      }
    },

    async save(project) {
      const database = await open();
      try {
        await transact(database, 'readwrite', (store) =>
          store.put(writeProjectFile(project.designs, project.sheet), KEY),
        );
      } finally {
        database.close();
      }
    },

    async clear() {
      const database = await open();
      try {
        await transact(database, 'readwrite', (store) => store.delete(KEY));
      } finally {
        database.close();
      }
    },
  };
}

/**
 * Waits for a lull before writing. Every keystroke changes the project, and
 * IndexedDB does not need to hear about all of them.
 */
export interface DebouncedSave {
  (project: Project): void;
  /** Write whatever is waiting, now. */
  readonly flush: () => void;
}

export function debounceSave(
  store: ProjectStore,
  delayMs: number,
  onError: (error: unknown) => void,
): DebouncedSave {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: Project | undefined;

  const write = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    const toSave = pending;
    pending = undefined;
    if (toSave) store.save(toSave).catch(onError);
  };

  const save = (project: Project): void => {
    pending = project;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(write, delayMs);
  };

  return Object.assign(save, { flush: write });
}
