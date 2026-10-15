// Autosave to IndexedDB, and .aenodes.json import/export (spec §12 Persistence).
import { projectSchema, type Project } from '../core';
import { useStore } from './store';

const DB = 'expressionlab';
const STORE = 'kv';
const KEY = 'autosave';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key: string): Promise<unknown> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Restores the autosaved project (if valid) and starts saving on every change. */
export async function startAutosave(): Promise<void> {
  try {
    const saved = projectSchema.safeParse(await idbGet(KEY));
    if (saved.success && saved.data.graphs.length) {
      const project = saved.data as Project;
      useStore.setState({ project, graphId: project.graphs[0]!.id, past: [], future: [] });
    }
  } catch {
    // IndexedDB unavailable (private mode etc.): run without autosave.
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  useStore.subscribe((s, prev) => {
    if (s.project === prev.project) return;
    clearTimeout(timer);
    timer = setTimeout(() => void idbSet(KEY, s.project).catch(() => {}), 400);
  });
}

export function exportProject(project: Project): void {
  const name = (project.graphs[0]?.name || 'project').replace(/[^\w-]+/g, '-').toLowerCase();
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${name}.aenodes.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Parses and validates an .aenodes.json file. Throws a readable error. */
export function parseProjectFile(text: string): Project {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('Not a JSON file');
  }
  const r = projectSchema.safeParse(json);
  if (!r.success) {
    const first = r.error.issues[0];
    throw new Error(`Not a valid project: ${first?.path.join('.') || 'file'}: ${first?.message}`);
  }
  if (!r.data.graphs.length) throw new Error('The project has no graphs');
  return r.data as Project;
}
