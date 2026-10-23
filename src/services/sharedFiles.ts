// src/services/sharedFiles.ts
// Übergabe von Dateien an andere KodiniTools (gleiche Origin kodinitools.com).
// Protokoll identisch zum Audiokonverter (src/services/SharedFileRepository.ts):
// IndexedDB "kodinitools-shared-files", Store "audio-files"; das Ziel-Tool wird
// mit "?source=<tool>" geöffnet und liest die Einträge beim Start aus.

export const SHARED_DB_NAME = 'kodinitools-shared-files'
export const SHARED_STORE_NAME = 'audio-files'
const SHARED_DB_VERSION = 1

/** Kennung dieses Tools als Quelle (Query-Parameter + Eintrag). */
export const SHARE_SOURCE = 'audio-cutter'

export interface SharedFileInput {
  name: string
  blob: Blob
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SHARED_DB_NAME, SHARED_DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(SHARED_STORE_NAME)) {
        db.createObjectStore(SHARED_STORE_NAME, { keyPath: 'id', autoIncrement: true })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** Ersetzt den Inhalt des Übergabe-Speichers durch die angegebenen Dateien. */
export async function shareFiles(files: SharedFileInput[]): Promise<void> {
  const db = await openDB()
  const tx = db.transaction(SHARED_STORE_NAME, 'readwrite')
  const store = tx.objectStore(SHARED_STORE_NAME)
  store.clear()
  for (const file of files) {
    store.put({
      name: file.name,
      blob: file.blob,
      mimeType: file.blob.type,
      source: SHARE_SOURCE,
      sharedAt: Date.now(),
    })
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error)
    }
    tx.onabort = () => {
      db.close()
      reject(tx.error ?? new Error('shareFailed'))
    }
  })
}

/** URL des Audiokonverters inkl. Quellkennung (Default: gleiche Origin). */
export function audioConverterUrl(): string {
  const env = (import.meta as unknown as { env?: Record<string, string> }).env
  const base = env?.VITE_AUDIOKONVERTER_URL || '/audiokonverter/'
  return `${base}?source=${SHARE_SOURCE}`
}
