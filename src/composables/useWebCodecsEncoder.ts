// src/composables/useWebCodecsEncoder.ts
// Browser-Encoding für AAC (M4A) und Opus (WebM) über die WebCodecs-API.
// Container-Muxing übernimmt `mediabunny`; die Bibliothek wird erst beim
// Export dynamisch geladen, damit der Start der App schlank bleibt.

import type { ExportFormat } from '../types/audio'

/** Formate, die (je nach Browser) per WebCodecs kodierbar sind. */
export type WebCodecsFormat = Extract<ExportFormat, 'aac' | 'webm'>

export const WEBCODECS_FORMATS: readonly WebCodecsFormat[] = ['aac', 'webm']

/** WebCodecs-Codec-String je Format (für die Feature-Erkennung). */
const CODEC_STRING: Record<WebCodecsFormat, string> = {
  aac: 'mp4a.40.2', // AAC-LC
  webm: 'opus',
}

/** Opus kennt nur bestimmte Raten; 48 kHz ist überall unterstützt. */
const OPUS_SAMPLE_RATE = 48_000
/** Frames pro an den Encoder übergebenem Block (~1 s bei 48 kHz). */
const CHUNK_FRAMES = 48_000

export interface WebCodecsEncodeControls {
  signal?: AbortSignal
  onProgress?: (fraction: number) => void
}

export function webCodecsAvailable(): boolean {
  return typeof AudioEncoder !== 'undefined' && typeof AudioEncoder.isConfigSupported === 'function'
}

async function isSupported(config: AudioEncoderConfig): Promise<boolean> {
  try {
    const res = await AudioEncoder.isConfigSupported(config)
    return res.supported === true
  } catch {
    return false
  }
}

/**
 * Ermittelt, welche WebCodecs-Formate dieser Browser kodieren kann.
 * Nie werfend: bei fehlender API oder Fehlern -> leere Liste.
 */
export async function detectWebCodecsFormats(): Promise<WebCodecsFormat[]> {
  if (!webCodecsAvailable()) return []
  const probes: Record<WebCodecsFormat, AudioEncoderConfig> = {
    aac: { codec: CODEC_STRING.aac, sampleRate: 44_100, numberOfChannels: 2, bitrate: 128_000 },
    webm: {
      codec: CODEC_STRING.webm,
      sampleRate: OPUS_SAMPLE_RATE,
      numberOfChannels: 2,
      bitrate: 128_000,
    },
  }
  const results = await Promise.all(
    WEBCODECS_FORMATS.map(async (f) => ((await isSupported(probes[f])) ? f : null)),
  )
  return results.filter((f): f is WebCodecsFormat => f !== null)
}

/** Ziel-Samplerate: Opus immer 48 kHz; AAC behält die Quellrate, wenn möglich. */
async function targetSampleRate(
  format: WebCodecsFormat,
  sourceRate: number,
  numberOfChannels: number,
  bitrate: number,
): Promise<number> {
  if (format === 'webm') return OPUS_SAMPLE_RATE
  for (const rate of [sourceRate, 48_000, 44_100]) {
    if (
      await isSupported({ codec: CODEC_STRING.aac, sampleRate: rate, numberOfChannels, bitrate })
    ) {
      return rate
    }
  }
  throw new Error('formatNotInBrowser')
}

function abortError(): DOMException {
  return new DOMException('Abgebrochen.', 'AbortError')
}

/**
 * Kodiert Float32-Kanäle als AAC (M4A) bzw. Opus (WebM).
 * Mehr als zwei Kanäle werden (wie beim MP3-Export) auf die ersten beiden reduziert;
 * Resampling (z. B. 44,1 -> 48 kHz für Opus) übernimmt mediabunny.
 * @throws DOMException('AbortError') bei Abbruch, Error('formatNotInBrowser') ohne Encoder-Support.
 */
export async function encodeWithWebCodecs(
  channels: Float32Array[],
  sampleRate: number,
  format: WebCodecsFormat,
  kbps: number,
  controls: WebCodecsEncodeControls = {},
): Promise<Uint8Array<ArrayBuffer>> {
  const { signal, onProgress } = controls
  if (!webCodecsAvailable()) throw new Error('formatNotInBrowser')
  if (signal?.aborted) throw abortError()

  const input = channels.slice(0, 2)
  const numberOfChannels = input.length
  const totalFrames = input[0]?.length ?? 0
  if (totalFrames === 0) throw new Error('emptyRegion')
  const bitrate = Math.round(kbps * 1000)
  const outRate = await targetSampleRate(format, sampleRate, numberOfChannels, bitrate)

  const mb = await import('mediabunny')
  if (signal?.aborted) throw abortError()

  const output = new mb.Output({
    format:
      format === 'aac'
        ? new mb.Mp4OutputFormat({ fastStart: 'in-memory' })
        : new mb.WebMOutputFormat(),
    target: new mb.BufferTarget(),
  })
  const totalSec = totalFrames / sampleRate
  const source = new mb.AudioSampleSource({
    codec: format === 'aac' ? 'aac' : 'opus',
    quality: new mb.Quality({ bitrate }),
    transform: outRate !== sampleRate ? { sampleRate: outRate } : undefined,
    // Fortschritt nach tatsächlich kodierter Zeit: Der Encoder puffert intern,
    // das Einspeisen ist daher kein brauchbares Maß.
    onEncodedPacket: (packet) => {
      onProgress?.(Math.min(0.99, (packet.timestamp + packet.duration) / totalSec))
    },
  })
  output.addAudioTrack(source)

  // Abbruch muss auch laufende Encoder-Arbeit (v. a. finalize) sofort beenden.
  let rejectOnAbort: (reason: unknown) => void = () => {}
  const aborted = new Promise<never>((_, reject) => {
    rejectOnAbort = reject
  })
  aborted.catch(() => {}) // nur via race ausgewertet
  const onAbort = (): void => rejectOnAbort(abortError())
  signal?.addEventListener('abort', onAbort, { once: true })
  const untilAborted = <T>(p: Promise<T>): Promise<T> => Promise.race([p, aborted])

  try {
    await untilAborted(output.start())
    for (let offset = 0; offset < totalFrames; offset += CHUNK_FRAMES) {
      if (signal?.aborted) throw abortError()
      const frames = Math.min(CHUNK_FRAMES, totalFrames - offset)
      // f32-planar: Kanäle hintereinander in einem Puffer.
      const planar = new Float32Array(frames * numberOfChannels)
      for (let c = 0; c < numberOfChannels; c++) {
        planar.set(input[c].subarray(offset, offset + frames), c * frames)
      }
      const sample = new mb.AudioSample({
        data: planar,
        format: 'f32-planar',
        numberOfChannels,
        sampleRate,
        timestamp: offset / sampleRate,
      })
      try {
        await untilAborted(source.add(sample))
      } finally {
        sample.close()
      }
    }
    await untilAborted(output.finalize())
  } catch (err) {
    if (output.state !== 'finalized' && output.state !== 'canceled') {
      await output.cancel().catch(() => {})
    }
    throw err
  } finally {
    signal?.removeEventListener('abort', onAbort)
  }

  const buffer = output.target.buffer
  if (!buffer) throw new Error('processFailed')
  onProgress?.(1)
  return new Uint8Array(buffer)
}
