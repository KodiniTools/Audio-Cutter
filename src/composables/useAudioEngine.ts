// src/composables/useAudioEngine.ts
// Browser-seitige Audio-Verarbeitung (Web Audio API + lamejs).
// Kapselt alle nicht-testbaren Browser-APIs; die eigentliche Logik liegt in ../utils.
// MP3-Encoding läuft im Web Worker (Fortschritt + Abbruch); Sync-Fallback ohne Worker.

import { Mp3Encoder } from '@breezystack/lamejs'
import type { AudioMeta, CutRegion, CutResult, DecodedAudio, ExportOptions } from '../types/audio'
import { samplesToMs } from '../utils/audioMath'
import { encodeWav } from '../utils/wavEncoder'
import { channelCountFor, encodeMp3Blocks } from '../utils/mp3Encoder'
import { encodeMp3InWorker, workerSupported } from './useMp3Worker'

/** Optionale Steuerung für {@link useAudioEngine.encode}. */
export interface CutControls {
  signal?: AbortSignal
  onProgress?: (fraction: number) => void
}

let sharedCtx: AudioContext | null = null

function getContext(): AudioContext {
  if (!sharedCtx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    sharedCtx = new Ctor()
  }
  return sharedCtx
}

export function useAudioEngine() {
  /**
   * Dekodiert eine Datei zu rohen Kanaldaten + Metadaten.
   * @throws Error mit stabilem Code ('decodeFailed') für die i18n-Auflösung im UI.
   */
  async function decode(file: File): Promise<{ meta: AudioMeta; decoded: DecodedAudio }> {
    const arrayBuffer = await file.arrayBuffer()
    let audioBuffer: AudioBuffer
    try {
      // slice(0) -> Kopie, da decodeAudioData den Buffer "detached".
      audioBuffer = await getContext().decodeAudioData(arrayBuffer.slice(0))
    } catch {
      throw new Error('decodeFailed')
    }

    const channels: Float32Array[] = []
    for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
      // getChannelData liefert eine Referenz -> kopieren, um AudioBuffer nicht zu binden.
      channels.push(new Float32Array(audioBuffer.getChannelData(ch)))
    }

    const meta: AudioMeta = {
      name: file.name,
      size: file.size,
      mimeType: file.type || 'audio/unknown',
      durationMs: audioBuffer.duration * 1000,
      sampleRate: audioBuffer.sampleRate,
      numberOfChannels: audioBuffer.numberOfChannels,
    }
    return { meta, decoded: { sampleRate: audioBuffer.sampleRate, channels } }
  }

  /**
   * Kodiert den (bereits geschnittenen) Puffer nach WAV oder MP3.
   * Die Schnitte + Fades wurden im kumulativen Editor bereits auf den Puffer
   * angewendet – hier wird nur noch der finale Zustand encodiert.
   * MP3 läuft im Worker (nicht-blockierend); WAV bleibt synchron.
   * @throws DOMException('AbortError') bei Abbruch, Error('emptyRegion') bei leerem Puffer.
   */
  async function encode(
    decoded: DecodedAudio,
    options: ExportOptions,
    baseName: string,
    controls: CutControls = {},
  ): Promise<CutResult> {
    const { signal, onProgress } = controls
    const { sampleRate, channels } = decoded
    if (channels.length === 0 || channels[0].length === 0) {
      throw new Error('emptyRegion')
    }

    const durationMs = samplesToMs(channels[0].length, sampleRate)
    const stem = baseName.replace(/\.[^.]+$/, '') || 'audio'

    // Der Browser-Modus kodiert nur WAV + MP3; alles Übrige liefert der Server.
    if (options.format !== 'wav' && options.format !== 'mp3') {
      throw new Error('formatNotInBrowser')
    }

    if (options.format === 'wav') {
      const wav = encodeWav(channels, sampleRate)
      onProgress?.(1)
      return {
        blob: new Blob([wav], { type: 'audio/wav' }),
        filename: `${stem}_cut.wav`,
        format: 'wav',
        durationMs,
      }
    }

    // MP3: bevorzugt im Worker (Main-Thread bleibt frei), sonst synchroner Fallback.
    let mp3: Uint8Array<ArrayBuffer>
    if (workerSupported()) {
      mp3 = await encodeMp3InWorker(channels, sampleRate, options.mp3Bitrate, { signal, onProgress })
    } else {
      if (signal?.aborted) throw new DOMException('Abgebrochen.', 'AbortError')
      const encoder = new Mp3Encoder(channelCountFor(channels), sampleRate, options.mp3Bitrate)
      mp3 = encodeMp3Blocks(channels, encoder, onProgress)
    }

    return {
      blob: new Blob([mp3], { type: 'audio/mpeg' }),
      filename: `${stem}_cut.mp3`,
      format: 'mp3',
      durationMs,
    }
  }

  /** Kodiert den aktuellen Puffer verlustfrei als WAV-Blob (für den Server-Upload). */
  function toWavBlob(decoded: DecodedAudio): Blob {
    const wav = encodeWav(decoded.channels, decoded.sampleRate)
    return new Blob([wav], { type: 'audio/wav' })
  }

  /**
   * Erzeugt einen Vorschau-Player für den Bereich [startMs, endMs].
   * Unterstützt Pause/Resume/Stop und meldet die Live-Position (ms) via onTime.
   * Web Audio kennt kein natives Pause -> beim Fortsetzen wird eine neue
   * BufferSource ab der eingefrorenen Position gestartet.
   */
  function createRegionPlayer(
    decoded: DecodedAudio,
    region: CutRegion,
    callbacks: { onTime: (ms: number) => void; onEnded: () => void },
  ): RegionPlayer {
    const ctx = getContext()
    const { sampleRate, channels } = decoded
    const buffer = ctx.createBuffer(channels.length, channels[0].length, sampleRate)
    // Unsere Kanäle sind ArrayBuffer-gestützt; copyToChannel verlangt seit TS 5.7 diesen Buffertyp.
    for (let ch = 0; ch < channels.length; ch++) {
      buffer.copyToChannel(channels[ch] as Float32Array<ArrayBuffer>, ch)
    }

    const startMs = Math.max(0, region.startMs)
    const endMs = Math.max(startMs, region.endMs)

    let src: AudioBufferSourceNode | null = null
    let anchorCtxTime = 0 // ctx.currentTime beim letzten (Neu-)Start
    let anchorMs = startMs // Position beim letzten (Neu-)Start
    let posMs = startMs
    let paused = false
    let raf = 0

    function computePos(): number {
      return anchorMs + (ctx.currentTime - anchorCtxTime) * 1000
    }

    function tick(): void {
      if (!src) return
      posMs = computePos()
      if (posMs >= endMs) {
        posMs = endMs
        callbacks.onTime(posMs)
        stopSrc()
        paused = false
        posMs = startMs
        callbacks.onEnded()
        return
      }
      callbacks.onTime(posMs)
      raf = requestAnimationFrame(tick)
    }

    function stopSrc(): void {
      cancelAnimationFrame(raf)
      raf = 0
      if (src) {
        try {
          src.onended = null
          src.stop()
        } catch {
          /* bereits gestoppt */
        }
        try {
          src.disconnect()
        } catch {
          /* ignore */
        }
        src = null
      }
    }

    function startFrom(ms: number): void {
      if (ctx.state === 'suspended') void ctx.resume()
      stopSrc()
      src = ctx.createBufferSource()
      src.buffer = buffer
      src.connect(ctx.destination)
      anchorMs = Math.min(Math.max(ms, startMs), endMs)
      anchorCtxTime = ctx.currentTime
      posMs = anchorMs
      paused = false
      const durSec = Math.max(0, (endMs - anchorMs) / 1000)
      src.start(0, anchorMs / 1000, durSec)
      raf = requestAnimationFrame(tick)
    }

    // Sofort losspielen.
    startFrom(startMs)

    return {
      pause(): number {
        if (paused || !src) return posMs
        posMs = Math.min(computePos(), endMs)
        stopSrc()
        paused = true
        return posMs
      },
      resume(): void {
        if (paused) startFrom(posMs)
      },
      stop(): void {
        stopSrc()
        paused = false
        posMs = startMs
      },
      currentMs(): number {
        return posMs
      },
      isPaused(): boolean {
        return paused
      },
    }
  }

  return { decode, encode, toWavBlob, createRegionPlayer }
}

/** Steuer-Handle eines laufenden Vorschau-Players. */
export interface RegionPlayer {
  /** Hält an und liefert die aktuelle Position (ms). */
  pause(): number
  /** Setzt ab der eingefrorenen Position fort. */
  resume(): void
  /** Stoppt und setzt auf den Bereichsanfang zurück. */
  stop(): void
  /** Aktuelle Position (ms). */
  currentMs(): number
  isPaused(): boolean
}
