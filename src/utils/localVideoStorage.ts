/**
 * IndexedDB storage helper for instant local video playback.
 * Allows users on static deployments (like Firebase Hosting) or data-saver setups
 * to store their selected video file in browser storage so it plays instantly
 * without server upload or manual re-selection.
 */

const DB_NAME = 'penguin_view_local_videos';
const STORE_NAME = 'videos';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not supported in this browser'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function storeLocalVideo(fileName: string, file: File | Blob): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const cleanKey = fileName.trim().toLowerCase();
      const req = store.put(file, cleanKey);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Could not store video in IndexedDB (might exceed browser quota):', err);
  }
}

export async function getLocalVideo(fileName: string): Promise<Blob | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const cleanKey = fileName.trim().toLowerCase();
      const req = store.get(cleanKey);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function hasLocalVideo(fileName: string): Promise<boolean> {
  try {
    const blob = await getLocalVideo(fileName);
    return !!blob;
  } catch {
    return false;
  }
}
