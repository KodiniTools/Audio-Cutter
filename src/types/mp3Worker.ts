// src/types/mp3Worker.ts
// Nachrichten-Contract zwischen Main-Thread und MP3-Worker.

import type { EncoderWorkerResponse } from '../composables/useEncoderWorker'

export interface Mp3WorkerRequest {
  /** Ein Float32Array pro Kanal (Buffer werden per Transfer übergeben). */
  channels: Float32Array[]
  sampleRate: number
  kbps: number
}

export type Mp3WorkerResponse = EncoderWorkerResponse
