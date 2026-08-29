// src/utils/zoom.ts
// Reine Sichtfenster-Mathematik fuer den Waveform-Zoom (testbar, ohne Browser).

export interface ViewWindow {
  /** Linker Rand des sichtbaren Fensters als Frac [0..1] der Gesamtlaenge. */
  start: number
  /** Rechter Rand als Frac [0..1]. */
  end: number
  /** Fensterbreite als Frac (= 1 / zoom). */
  width: number
}

/** Begrenzt den Zoom auf [1, max]. */
export function clampZoom(zoom: number, max = 500): number {
  if (!Number.isFinite(zoom)) return 1
  return Math.max(1, Math.min(max, zoom))
}

/**
 * Sichtbares Fenster fuer eine Zoomstufe, zentriert auf `centerFrac`.
 * Wird an den Raendern [0,1] festgehalten (kein Ueberlaufen).
 */
export function viewWindow(zoom: number, centerFrac: number): ViewWindow {
  const width = 1 / clampZoom(zoom)
  const c = Number.isFinite(centerFrac) ? centerFrac : 0.5
  const start = Math.max(0, Math.min(1 - width, c - width / 2))
  return { start, end: start + width, width }
}

/** View-Frac [0..1] (relativ zum Fenster) -> absoluter Frac [0..1]. */
export function viewToAbs(viewFrac: number, win: ViewWindow): number {
  return win.start + viewFrac * win.width
}

/** Absoluter Frac [0..1] -> View-Frac (kann ausserhalb [0,1] liegen = nicht sichtbar). */
export function absToView(absFrac: number, win: ViewWindow): number {
  return win.width > 0 ? (absFrac - win.start) / win.width : 0
}
