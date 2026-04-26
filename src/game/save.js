const DB_NAME = "exocraft-db";
const DB_VERSION = 1;
const STORE_NAME = "saves";

function hasIndexedDb() {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => {
      reject(request.error || new Error("Failed to open IndexedDB"));
    };
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => {
      resolve(request.result);
    };
  });
}

function localStorageKey(slot) {
  return `exocraft-save-${slot}`;
}

export async function putSave(slot, data) {
  if (!hasIndexedDb()) {
    window.localStorage.setItem(localStorageKey(slot), JSON.stringify(data));
    return;
  }
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.onerror = () => reject(tx.error || new Error("Failed to write save"));
    tx.oncomplete = () => resolve();
    tx.objectStore(STORE_NAME).put(data, slot);
  });
  db.close();
}

export async function getSave(slot) {
  if (!hasIndexedDb()) {
    const raw = window.localStorage.getItem(localStorageKey(slot));
    return raw ? JSON.parse(raw) : null;
  }
  const db = await openDb();
  const result = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    tx.onerror = () => reject(tx.error || new Error("Failed to read save"));
    const request = tx.objectStore(STORE_NAME).get(slot);
    request.onerror = () => reject(request.error || new Error("Failed to read save"));
    request.onsuccess = () => resolve(request.result || null);
  });
  db.close();
  return result;
}

export async function removeSave(slot) {
  if (!hasIndexedDb()) {
    window.localStorage.removeItem(localStorageKey(slot));
    return;
  }
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.onerror = () => reject(tx.error || new Error("Failed to remove save"));
    tx.oncomplete = () => resolve();
    tx.objectStore(STORE_NAME).delete(slot);
  });
  db.close();
}
