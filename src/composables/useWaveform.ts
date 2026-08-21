// src/composables/useWaveform.ts
// Zeichnet Waveform + Auswahlbereich + Playhead auf ein Canvas.
// Peak-Berechnung liegt in ../utils/waveform (testbar).

import { computePeaks } from '../utils/waveform'

export interface WaveformDrawOptions {
  /** Auswahl in Sekundenanteil [0..1] der Gesamtlänge. */
  regionStart: number
  regionEnd: number
  /** Playhead-Position [0..1] oder null. */
  playhead: number | null
  colors: {
    waveform: string
    regionFill: string
    regionBorder: string
    playhead: string
    background: string
    axis: string
  }
}

export function useWaveform() {
  function draw(
    canvas: HTMLCanvasElement,
    channel: Float32Array | null,
    opts: WaveformDrawOptions,
  ): void {
    const dpr = window.devicePixelRatio || 1
    const cssWidth = canvas.clientWidth || 800
    const cssHeight = canvas.clientHeight || 160

    // HiDPI-scharf zeichnen.
    if (canvas.width !== Math.round(cssWidth * dpr) || canvas.height !== Math.round(cssHeight * dpr)) {
      canvas.width = Math.round(cssWidth * dpr)
      canvas.height = Math.round(cssHeight * dpr)
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const w = cssWidth
    const h = cssHeight
    const mid = h / 2

    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = opts.colors.background
    ctx.fillRect(0, 0, w, h)

    // Mittellinie
    ctx.strokeStyle = opts.colors.axis
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, mid)
    ctx.lineTo(w, mid)
    ctx.stroke()

    // Waveform
    if (channel && channel.length > 0) {
      const peaks = computePeaks(channel, w)
      ctx.strokeStyle = opts.colors.waveform
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let x = 0; x < peaks.length; x++) {
        const { min, max } = peaks[x]
        const yMax = mid - max * mid
        const yMin = mid - min * mid
        ctx.moveTo(x + 0.5, yMax)
        ctx.lineTo(x + 0.5, yMin)
      }
      ctx.stroke()
    }

    // Auswahlbereich
    const xStart = Math.round(opts.regionStart * w)
    const xEnd = Math.round(opts.regionEnd * w)
    ctx.fillStyle = opts.colors.regionFill
    ctx.fillRect(xStart, 0, Math.max(1, xEnd - xStart), h)
    ctx.strokeStyle = opts.colors.regionBorder
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(xStart + 0.5, 0)
    ctx.lineTo(xStart + 0.5, h)
    ctx.moveTo(xEnd - 0.5, 0)
    ctx.lineTo(xEnd - 0.5, h)
    ctx.stroke()

    // Playhead
    if (opts.playhead !== null) {
      const xp = Math.round(opts.playhead * w)
      ctx.strokeStyle = opts.colors.playhead
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(xp + 0.5, 0)
      ctx.lineTo(xp + 0.5, h)
      ctx.stroke()
    }
  }

  return { draw }
}
