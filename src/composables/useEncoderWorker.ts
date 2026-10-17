// src/composables/useEncoderWorker.ts
// Gemeinsamer Ablauf für Encoder-Worker (MP3, FLAC): einmaliger Job als Promise
// mit Fortschritt (onProgress) und Abbruch (AbortSignal -> worker.terminate()).

/** Antwort-Contract, den alle Encoder-Worker einhalten. */
export type EncoderWorkerResponse =
  | { type: 'progress'; value: number } // 0..1
  | { type: 'done'; data: Uint8Array<ArrayBuffer> }
  | { type: 'error'; message: string }

export interface EncoderWorkerOptions {
  signal?: AbortSignal
  onProgress?: (fraction: number) => void
}

/** True, wenn Web Worker in dieser Umgebung verfügbar sind. */
export function workerSupported(): boolean {
  return typeof Worker !== 'undefined'
}

/**
 * Startet einen Worker, sendet `request` (mit `transfer`) und wartet auf das Ergebnis.
 * `createWorker` muss `new Worker(new URL(...), ...)` literal enthalten (Vite-Bundling).
 * @throws DOMException('AbortError') bei Abbruch, sonst Error bei Encoding-Fehlern.
 */
export function runEncoderWorker<Req>(
  createWorker: () => Worker,
  request: Req,
  transfer: Transferable[],
  opts: EncoderWorkerOptions = {},
): Promise<Uint8Array<ArrayBuffer>> {
  const { signal, onProgress } = opts

  return new Promise<Uint8Array<ArrayBuffer>>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Abgebrochen.', 'AbortError'))
      return
    }

    const worker = createWorker()

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

    worker.onmessage = (e: MessageEvent<EncoderWorkerResponse>): void => {
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
      reject(new Error(e.message || 'Worker-Fehler beim Encoding.'))
    }

    worker.postMessage(request, transfer)
  })
}
