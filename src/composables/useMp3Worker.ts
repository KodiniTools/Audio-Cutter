// src/composables/useMp3Worker.ts
// Startet den MP3-Worker als einmaligen Job und liefert ein Promise.
// Unterstützt Fortschritt (onProgress) und Abbruch (AbortSignal -> worker.terminate()).

import type { Mp3WorkerRequest, Mp3WorkerResponse } from '../types/mp3Worker'

export interface Mp3WorkerOptions {
  signal?: AbortSignal
  onProgress?: (fraction: number) => void
}

/** True, wenn Web Worker in dieser Umgebung verfügbar sind. */
export function workerSupported(): boolean {
  return typeof Worker !== 'undefined'
}

/**
 * Kodiert Kanaldaten im Worker zu MP3.
 * @throws DOMException('AbortError') bei Abbruch, sonst Error bei Encoding-Fehlern.
 */
export function encodeMp3InWorker(
  channels: Float32Array[],
  sampleRate: number,
  kbps: number,
  opts: Mp3WorkerOptions = {},
): Promise<Uint8Array<ArrayBuffer>> {
  const { signal, onProgress } = opts

  return new Promise<Uint8Array<ArrayBuffer>>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Abgebrochen.', 'AbortError'))
      return
    }

    const worker = new Worker(new URL('../workers/mp3.worker.ts', import.meta.url), {
      type: 'module',
    })

    let settled = false
    const cleanup = (): void => {
      worker.onmessage = null
      worker.onerror = null
      signal?.removeEventListener('abort', onAbort)
      worker.terminate()
    }

    const onAbort = (): void => {
      if (settled) return
      settled = true
      cleanup()
      reject(new DOMException('Abgebrochen.', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })

    worker.onmessage = (e: MessageEvent<Mp3WorkerResponse>): void => {
      const msg = e.data
      if (msg.type === 'progress') {
        onProgress?.(msg.value)
      } else if (msg.type === 'done') {
        if (settled) return
        settled = true
        cleanup()
        resolve(msg.data)
      } else {
        if (settled) return
        settled = true
        cleanup()
        reject(new Error(msg.message))
      }
    }

    worker.onerror = (e: ErrorEvent): void => {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error(e.message || 'Worker-Fehler beim MP3-Encoding.'))
    }

    // Kanal-Buffer per Transfer übergeben (kein Kopieren) – Daten sind bereits geschnitten.
    const req: Mp3WorkerRequest = { channels, sampleRate, kbps }
    worker.postMessage(
      req,
      channels.map((c) => c.buffer),
    )
  })
}
