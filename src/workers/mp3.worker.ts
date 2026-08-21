/// <reference lib="webworker" />
// src/workers/mp3.worker.ts
// Lagert das (CPU-intensive) MP3-Encoding vom Main-Thread aus.
// Empfängt rohe Kanaldaten, meldet Fortschritt und liefert die MP3-Bytes zurück.

import { Mp3Encoder } from 'lamejs'
import { channelCountFor, encodeMp3Blocks } from '../utils/mp3Encoder'
import type { Mp3WorkerRequest, Mp3WorkerResponse } from '../types/mp3Worker'

const ctx = self as unknown as DedicatedWorkerGlobalScope

function post(msg: Mp3WorkerResponse, transfer?: Transferable[]): void {
  ctx.postMessage(msg, transfer ?? [])
}

ctx.onmessage = (e: MessageEvent<Mp3WorkerRequest>): void => {
  const { channels, sampleRate, kbps } = e.data
  try {
    const numChannels = channelCountFor(channels)
    const encoder = new Mp3Encoder(numChannels, sampleRate, kbps)

    let lastReported = -1
    const data = encodeMp3Blocks(channels, encoder, (fraction) => {
      // Fortschritt drosseln (max. ~100 Updates), um Message-Spam zu vermeiden.
      const rounded = Math.floor(fraction * 100)
      if (rounded !== lastReported) {
        lastReported = rounded
        post({ type: 'progress', value: fraction })
      }
    })

    post({ type: 'done', data }, [data.buffer])
  } catch (err) {
    post({
      type: 'error',
      message: err instanceof Error ? err.message : 'MP3-Encoding im Worker fehlgeschlagen.',
    })
  }
}
