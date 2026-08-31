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
  /** Sichtbares Fenster [0..1] der Gesamtlänge (Zoom). Default 0..1 = alles. */
  viewStart?: number
  viewEnd?: number
  colors: {
    waveform: string
    regionFill: string
    /** Rand des Auswahlanfangs (Start-Cursor). */
    regionStartBorder: string
    /** Rand des Auswahlendes (End-Cursor). */
    regionEndBorder: string
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

    // Sichtfenster (Zoom): Default = ganze Datei.
    const viewStart = Math.max(0, Math.min(1, opts.viewStart ?? 0))
    const viewEnd = Math.max(viewStart, Math.min(1, opts.viewEnd ?? 1))
    const span = Math.max(1e-9, viewEnd - viewStart)
    // Absoluter Frac [0..1] -> X-Pixel im aktuellen Fenster.
    const toX = (frac: number): number => ((frac - viewStart) / span) * w

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

    // Waveform – nur den sichtbaren Sample-Ausschnitt zeichnen (Zoom = Beats sichtbar).
    if (channel && channel.length > 0) {
      const from = Math.max(0, Math.floor(viewStart * channel.length))
      const to = Math.min(channel.length, Math.ceil(viewEnd * channel.length))
      const slice = to > from ? channel.subarray(from, to) : channel
      const peaks = computePeaks(slice, w)
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

    // Auswahlbereich (auf das sichtbare Fenster geclippt).
    const xStart = Math.max(0, Math.min(w, toX(opts.regionStart)))
    const xEnd = Math.max(0, Math.min(w, toX(opts.regionEnd)))
    if (xEnd > xStart) {
      ctx.fillStyle = opts.colors.regionFill
      ctx.fillRect(xStart, 0, Math.max(1, xEnd - xStart), h)
    }
    // Randlinien getrennt einfaerben: Anfang = gelb, Ende = rot.
    ctx.lineWidth = 2
    // Startrand nur zeichnen, wenn er im Fenster liegt.
    if (opts.regionStart >= viewStart && opts.regionStart <= viewEnd) {
      const xs = toX(opts.regionStart)
      ctx.strokeStyle = opts.colors.regionStartBorder
      ctx.beginPath()
      ctx.moveTo(xs + 0.5, 0)
      ctx.lineTo(xs + 0.5, h)
      ctx.stroke()
    }
    if (opts.regionEnd >= viewStart && opts.regionEnd <= viewEnd) {
      const xe = toX(opts.regionEnd)
      ctx.strokeStyle = opts.colors.regionEndBorder
      ctx.beginPath()
      ctx.moveTo(xe - 0.5, 0)
      ctx.lineTo(xe - 0.5, h)
      ctx.stroke()
    }

    // Playhead (nur wenn im Fenster sichtbar).
    if (opts.playhead !== null && opts.playhead >= viewStart && opts.playhead <= viewEnd) {
      const xp = toX(opts.playhead)
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
