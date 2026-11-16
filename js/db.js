// Almacenamiento local (IndexedDB): cuadernos, carpetas y ajustes. Todo queda en el dispositivo.
let db;

export function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('freenotas', 2);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('notebooks')) d.createObjectStore('notebooks', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('folders')) d.createObjectStore('folders', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv', { keyPath: 'key' });
    };
    r.onsuccess = () => { db = r.result; res(); };
    r.onerror = () => rej(r.error);
  });
}

function req(store, mode, fn) {
  return new Promise((res, rej) => {
    const r = fn(db.transaction(store, mode).objectStore(store));
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export const DB = {
  all: (s) => req(s, 'readonly', (o) => o.getAll()),
  get: (s, k) => req(s, 'readonly', (o) => o.get(k)),
  put: (s, v) => req(s, 'readwrite', (o) => o.put(v)),
  del: (s, k) => req(s, 'readwrite', (o) => o.delete(k)),
};

export async function getKV(key, def) {
  const r = await DB.get('kv', key);
  return r ? r.value : def;
}
export const setKV = (key, value) => DB.put('kv', { key, value });
