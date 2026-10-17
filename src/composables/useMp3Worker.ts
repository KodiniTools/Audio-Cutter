// src/composables/useMp3Worker.ts
// Startet den MP3-Worker als einmaligen Job und liefert ein Promise.
// Unterstützt Fortschritt (onProgress) und Abbruch (AbortSignal -> worker.terminate()).

import type { Mp3WorkerRequest } from '../types/mp3Worker'
import { runEncoderWorker, workerSupported, type EncoderWorkerOptions } from './useEncoderWorker'

export { workerSupported }
export type Mp3WorkerOptions = EncoderWorkerOptions

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
  // Kanal-Buffer per Transfer übergeben (kein Kopieren) – Daten sind bereits geschnitten.
  const req: Mp3WorkerRequest = { channels, sampleRate, kbps }
  return runEncoderWorker(
    () => new Worker(new URL('../workers/mp3.worker.ts', import.meta.url), { type: 'module' }),
    req,
    channels.map((c) => c.buffer),
    opts,
  )
}
