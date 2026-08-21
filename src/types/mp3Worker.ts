// src/types/mp3Worker.ts
// Nachrichten-Contract zwischen Main-Thread und MP3-Worker.

export interface Mp3WorkerRequest {
  /** Ein Float32Array pro Kanal (Buffer werden per Transfer übergeben). */
  channels: Float32Array[]
  sampleRate: number
  kbps: number
}

export type Mp3WorkerResponse =
  | { type: 'progress'; value: number } // 0..1
  | { type: 'done'; data: Uint8Array<ArrayBuffer> }
  | { type: 'error'; message: string }
