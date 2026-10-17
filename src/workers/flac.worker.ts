/// <reference lib="webworker" />
// src/workers/flac.worker.ts
// Lagert das FLAC-Encoding vom Main-Thread aus.
// Empfängt 16-bit-Kanaldaten, meldet Fortschritt und liefert die FLAC-Bytes zurück.

import { encodeFlac } from '../utils/flacEncoder'
import type { FlacWorkerRequest, FlacWorkerResponse } from '../types/flacWorker'

const ctx = self as unknown as DedicatedWorkerGlobalScope

function post(msg: FlacWorkerResponse, transfer?: Transferable[]): void {
  ctx.postMessage(msg, transfer ?? [])
}

ctx.onmessage = (e: MessageEvent<FlacWorkerRequest>): void => {
  const { channels, sampleRate } = e.data
  try {
    let lastReported = -1
    const data = encodeFlac(channels, sampleRate, {
      onProgress: (fraction) => {
        // Fortschritt drosseln (max. ~100 Updates), um Message-Spam zu vermeiden.
        const rounded = Math.floor(fraction * 100)
        if (rounded !== lastReported) {
          lastReported = rounded
          post({ type: 'progress', value: fraction })
        }
      },
    })
    post({ type: 'done', data }, [data.buffer])
  } catch (err) {
    post({
      type: 'error',
      message: err instanceof Error ? err.message : 'FLAC-Encoding im Worker fehlgeschlagen.',
    })
  }
}
