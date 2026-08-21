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
const VERSION = 1;

/**
 * Another tab holding an old version open blocks the upgrade. Without this the
 * promise never settles and the app waits forever with nothing on screen.
 */
const BLOCKED_MESSAGE =
  'Another mdcovergen tab is holding this browser’s saved work open. Close it and reload.';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onblocked = () => reject(new Error(BLOCKED_MESSAGE));
    request.onsuccess = () => {
      // If a later version wants in, get out of its way rather than blocking it.
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error ?? new Error('IndexedDB could not be opened'));
  });
}

/**
 * Reads settle on the request; writes settle on the *transaction*. A put can
 * succeed and its transaction still abort at commit — a large embedded artwork
 * against a near-full quota does exactly that — and reporting that as saved is
 * how work quietly disappears.
 */
function read<T>(database: IDBDatabase, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readonly');
    const request = run(transaction.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB read failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB read was aborted'));
  });
}

function write(database: IDBDatabase, run: (store: IDBObjectStore) => IDBRequest): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readwrite');
    run(transaction.objectStore(STORE));
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('IndexedDB could not commit the write'));
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB write failed'));
  });
}

export function createIndexedDbStore(): ProjectStore {
  let connection: Promise<IDBDatabase> | undefined;
  const database = (): Promise<IDBDatabase> => (connection ??= openDatabase());

  // One connection, one queue. Two overlapping saves on separate connections
  // have no guaranteed commit order, and the older project can land last.
  let queue: Promise<unknown> = Promise.resolve();
  const serialise = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task);
    queue = run.catch(() => undefined);
    return run;
  };

  return {
    load: () =>
      serialise(async () => {
        const text = await read<unknown>(await database(), (store) => store.get(KEY));
        if (typeof text !== 'string') return undefined;

        const result = readProjectFile(text);
        // Autosaved state this version cannot read is state it cannot use.
        // Reporting it as absent beats refusing to start.
        return result.ok ? result.project : undefined;
      }),

    save: (project) =>
      serialise(async () => {
        await write(await database(), (store) =>
          store.put(writeProjectFile(project.entries, project.sheet), KEY),
        );
      }),

    clear: () => serialise(async () => write(await database(), (store) => store.delete(KEY))),
  };
}

export interface DebouncedSave {
  (project: Project): void;
  /** Write whatever is waiting, now. */
  readonly flush: () => void;
}

/**
 * Waits for a lull before writing. Every keystroke changes the project, and
 * IndexedDB does not need to hear about all of them — but a reload must not
 * cost the collector the last thing they typed, hence `flush`.
 */
export function debounceSave(
  store: ProjectStore,
  delayMs: number,
  onError: (error: unknown) => void,
): DebouncedSave {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: Project | undefined;

  const writeNow = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    const toSave = pending;
    pending = undefined;
    if (toSave) store.save(toSave).catch(onError);
  };

  const save = (project: Project): void => {
    pending = project;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(writeNow, delayMs);
  };

  return Object.assign(save, { flush: writeNow });
}
