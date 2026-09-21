import type { InstructionVideo } from './reppy-data';
import { getSupabaseClient } from './supabase-client';

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

function safeFileName(name: string) {
  const normalized = name.normalize('NFKC').replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/g, '');
  return (normalized || 'instruction-video.mp4').slice(-180);
}

async function authenticatedClient() {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data, error } = await client.auth.getSession();
  if (error) throw new Error(error.message);
  return data.session ? { client, userId: data.session.user.id } : null;
}

export async function saveInstructionVideo(file: File, studentId?: string): Promise<InstructionVideo> {
  const authenticated = studentId ? await authenticatedClient() : null;
  if (authenticated) {
    const { client, userId } = authenticated;
    const relationshipResult = await client
      .from('trainer_student_relationships')
      .select('id')
      .eq('student_id', studentId)
      .maybeSingle();
    if (relationshipResult.error) throw new Error(relationshipResult.error.message);
    if (!relationshipResult.data) throw new Error('Не найдена связь с учеником для загрузки видео.');

    const id = crypto.randomUUID();
    const objectPath = `${relationshipResult.data.id}/${id}/${safeFileName(file.name)}`;
    const uploaded = await client.storage.from('instruction-videos').upload(objectPath, file, {
      cacheControl: '3600',
      contentType: file.type || 'video/mp4',
      upsert: false,
    });
    if (uploaded.error) throw new Error(uploaded.error.message);

    const metadata = await client.from('instruction_videos').insert({
      id,
      relationship_id: relationshipResult.data.id,
      uploaded_by: userId,
      object_path: objectPath,
      file_name: file.name || 'Видео упражнения',
      mime_type: file.type || 'video/mp4',
      byte_size: file.size,
    });
    if (metadata.error) {
      await client.storage.from('instruction-videos').remove([objectPath]);
      throw new Error(metadata.error.message);
    }
    return {
      id,
      name: file.name || 'Видео упражнения',
      mimeType: file.type || 'video/mp4',
      size: file.size,
      createdAt: new Date().toISOString(),
    };
  }

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
  if (!id.startsWith('instruction-video-')) {
    const authenticated = await authenticatedClient();
    if (!authenticated) return null;
    const { client } = authenticated;
    const metadata = await client
      .from('instruction_videos')
      .select('object_path')
      .eq('id', id)
      .maybeSingle();
    if (metadata.error) throw new Error(metadata.error.message);
    if (!metadata.data) return null;
    const downloaded = await client.storage.from('instruction-videos').download(metadata.data.object_path);
    if (downloaded.error) throw new Error(downloaded.error.message);
    return downloaded.data;
  }

  const database = await openDatabase();
  const stored = await new Promise<StoredInstructionVideo | undefined>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result as StoredInstructionVideo | undefined);
    request.onerror = () => reject(request.error ?? new Error('Не удалось загрузить видео.'));
  });
  database.close();
  return stored?.blob ?? null;
}

export async function cleanupOrphanedInstructionVideos(): Promise<number> {
  const authenticated = await authenticatedClient();
  if (!authenticated) return 0;
  const { client } = authenticated;
  const claimed = await client.rpc('claim_orphan_instruction_videos');
  if (claimed.error) throw new Error(claimed.error.message);

  const videos = (claimed.data ?? []) as { video_id: string; object_path: string }[];
  for (let index = 0; index < videos.length; index += 100) {
    const batch = videos.slice(index, index + 100);
    const removed = await client.storage.from('instruction-videos').remove(batch.map((video) => video.object_path));
    if (removed.error) throw new Error(removed.error.message);
    const finalized = await client.rpc('delete_claimed_instruction_videos', {
      p_video_ids: batch.map((video) => video.video_id),
    });
    if (finalized.error) throw new Error(finalized.error.message);
    if (finalized.data !== batch.length) throw new Error('Не удалось завершить очистку метаданных видео.');
  }
  return videos.length;
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
