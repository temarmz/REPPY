import type { InstructionVideo } from './reppy-data';

const DATABASE_NAME = 'reppy-instruction-media-v0';
const STORE_NAME = 'videos';

type StoredInstructionVideo = InstructionVideo & {
  blob: Blob;
};

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, 1);
    request.onerror = () => reject(request.error ?? new Error('Не удалось открыть хранилище видео.'));
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function videoId() {
  return `instruction-video-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

export async function saveInstructionVideo(file: File): Promise<InstructionVideo> {
  const video: StoredInstructionVideo = {
    id: videoId(),
    name: file.name || 'Видео упражнения',
    mimeType: file.type || 'video/mp4',
    size: file.size,
    createdAt: new Date().toISOString(),
    blob: file,
  };
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(video);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Не удалось сохранить видео.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Сохранение видео отменено.'));
  });
  database.close();
  return {
    id: video.id,
    name: video.name,
    mimeType: video.mimeType,
    size: video.size,
    createdAt: video.createdAt,
  };
}

export async function loadInstructionVideo(id: string): Promise<Blob | null> {
  const database = await openDatabase();
  const stored = await new Promise<StoredInstructionVideo | undefined>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result as StoredInstructionVideo | undefined);
    request.onerror = () => reject(request.error ?? new Error('Не удалось загрузить видео.'));
  });
  database.close();
  return stored?.blob ?? null;
}

export async function clearInstructionVideos(): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).clear();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Не удалось очистить видео.'));
  });
  database.close();
}
