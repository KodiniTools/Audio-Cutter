// src/types/flacWorker.ts
// Nachrichten-Contract zwischen Main-Thread und FLAC-Worker.

import type { EncoderWorkerResponse } from '../composables/useEncoderWorker'

export interface FlacWorkerRequest {
  /** Ein Int16Array pro Kanal (Buffer werden per Transfer übergeben). */
  channels: Int16Array[]
  sampleRate: number
}

export type FlacWorkerResponse = EncoderWorkerResponse
