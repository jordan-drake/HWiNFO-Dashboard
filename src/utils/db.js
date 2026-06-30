import { openDB } from 'idb';

const DB_NAME = 'hwinfo-dashboard';
const DB_VERSION = 1;

function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('sessions')) {
        db.createObjectStore('sessions');
      }
      if (!db.objectStoreNames.contains('metadata')) {
        db.createObjectStore('metadata');
      }
    },
  });
}

export async function storeSession(key, csvText, metadata) {
  const db = await getDB();
  const tx = db.transaction(['sessions', 'metadata'], 'readwrite');
  await tx.objectStore('sessions').put(csvText, key);
  await tx.objectStore('metadata').put(metadata, key);
  await tx.done;
}

export async function getSession(key) {
  const db = await getDB();
  return db.get('sessions', key);
}

export async function getAllMetadata() {
  const db = await getDB();
  const keys = await db.getAllKeys('metadata');
  const entries = [];
  for (const key of keys) {
    const meta = await db.get('metadata', key);
    entries.push({ key, ...meta });
  }
  return entries;
}

export async function deleteSession(key) {
  const db = await getDB();
  const tx = db.transaction(['sessions', 'metadata'], 'readwrite');
  await tx.objectStore('sessions').delete(key);
  await tx.objectStore('metadata').delete(key);
  await tx.done;
}

export async function getSessionCount() {
  const db = await getDB();
  const keys = await db.getAllKeys('metadata');
  return keys.length;
}
