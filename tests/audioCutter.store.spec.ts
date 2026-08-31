import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAudioCutterStore } from '../src/stores/audioCutter'
import type { AudioMeta, DecodedAudio } from '../src/types/audio'

const meta: AudioMeta = {
  name: 'song.wav',
  size: 1000,
  mimeType: 'audio/wav',
  durationMs: 10_000,
  sampleRate: 44100,
  numberOfChannels: 2,
}
const decoded: DecodedAudio = {
  sampleRate: 44100,
  channels: [new Float32Array(441000), new Float32Array(441000)],
}

describe('audioCutter store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('startet leer und ungültig', () => {
    const s = useAudioCutterStore()
    expect(s.hasAudio).toBe(false)
    expect(s.canCut).toBe(false)
    expect(s.canExport).toBe(false)
    expect(s.regionValidation.valid).toBe(false)
  })

  it('setDecoded initialisiert Region auf volle Länge', () => {
    const s = useAudioCutterStore()
    s.setDecoded(meta, decoded, null)
    expect(s.region.startMs).toBe(0)
    expect(s.region.endMs).toBe(10_000)
    expect(s.hasAudio).toBe(true)
    expect(s.canCut).toBe(true)
    // Ohne Schnitt ist Export noch nicht möglich.
    expect(s.hasEdits).toBe(false)
    expect(s.canExport).toBe(false)
  })

  it('setStart klemmt gegen 0 und Ende', () => {
    const s = useAudioCutterStore()
    s.setDecoded(meta, decoded, null)
    s.setStart(-500)
    expect(s.region.startMs).toBe(0)
    s.setStart(20_000) // > end -> auf end geklemmt
    expect(s.region.startMs).toBe(10_000)
  })

  it('setEnd klemmt gegen Start und Dauer', () => {
    const s = useAudioCutterStore()
    s.setDecoded(meta, decoded, null)
    s.setStart(3000)
    s.setEnd(99_000)
    expect(s.region.endMs).toBe(10_000)
    s.setEnd(1000) // < start -> auf start geklemmt
    expect(s.region.endMs).toBe(3000)
  })

  it('setRegion auto-sortiert', () => {
    const s = useAudioCutterStore()
    s.setDecoded(meta, decoded, null)
    s.setRegion(8000, 2000)
    expect(s.region.startMs).toBe(2000)
    expect(s.region.endMs).toBe(8000)
  })

  it('selectedDurationMs korrekt', () => {
    const s = useAudioCutterStore()
    s.setDecoded(meta, decoded, null)
    s.setRegion(2000, 5000)
    expect(s.selectedDurationMs).toBe(3000)
  })

  it('patchExportOptions merged', () => {
    const s = useAudioCutterStore()
    s.patchExportOptions({ format: 'mp3', mp3Bitrate: 256 })
    expect(s.exportOptions.format).toBe('mp3')
    expect(s.exportOptions.mp3Bitrate).toBe(256)
    expect(s.exportOptions.fadeInMs).toBe(0) // unverändert
  })

  it('setProgress clampt 0..1', () => {
    const s = useAudioCutterStore()
    s.setProgress(2)
    expect(s.progress).toBe(1)
    s.setProgress(-1)
    expect(s.progress).toBe(0)
  })

  it('setError setzt Status auf error', () => {
    const s = useAudioCutterStore()
    s.setError('boom')
    expect(s.status).toBe('error')
    expect(s.error).toBe('boom')
  })

  it('reset räumt auf', () => {
    const s = useAudioCutterStore()
    s.setDecoded(meta, decoded, null)
    s.reset()
    expect(s.hasAudio).toBe(false)
    expect(s.region).toEqual({ startMs: 0, endMs: 0 })
    expect(s.status).toBe('idle')
  })
})

describe('audioCutter store · kumulatives Schneiden', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('wendet einen Schnitt auf den Puffer an und verkürzt die Dauer', () => {
    const s = useAudioCutterStore()
    s.setDecoded(meta, decoded, null)
    s.setRegion(2000, 5000) // 3 s behalten
    const ok = s.applyCut()
    expect(ok).toBe(true)
    expect(s.durationMs).toBe(3000)
    expect(s.decoded?.channels[0].length).toBe(Math.round((3000 / 1000) * 44100))
    // Auswahl deckt nach dem Schnitt den ganzen neuen Puffer ab.
    expect(s.region).toEqual({ startMs: 0, endMs: 3000 })
    // Export ist jetzt möglich.
    expect(s.hasEdits).toBe(true)
    expect(s.canExport).toBe(true)
  })

  it('ist je Schnitt ein Undo-Schritt und stellt den Puffer wieder her', () => {
    const s = useAudioCutterStore()
    s.setDecoded(meta, decoded, null)
    s.setRegion(0, 6000)
    s.applyCut()
    expect(s.durationMs).toBe(6000)
    s.setRegion(0, 2000)
    s.applyCut()
    expect(s.durationMs).toBe(2000)

    // Ein Undo nimmt den letzten Schnitt zurück (Puffer = 6 s).
    s.undo()
    expect(s.durationMs).toBe(6000)
    expect(s.hasEdits).toBe(true)

    // Weiter zurück (auch die Auswahl-Schritte) bis zum Ursprungspuffer.
    while (s.canUndo) s.undo()
    expect(s.durationMs).toBe(10_000)
    expect(s.hasEdits).toBe(false)
    expect(s.canExport).toBe(false)
    // Vollständiges Redo stellt beide Schnitte wieder her.
    while (s.canRedo) s.redo()
    expect(s.durationMs).toBe(2000)
    expect(s.hasEdits).toBe(true)
  })

  it('entfernt die Auswahl aus dem Puffer (remove)', () => {
    const s = useAudioCutterStore()
    s.setDecoded(meta, decoded, null)
    s.patchExportOptions({ cutMode: 'remove' })
    s.setRegion(2000, 5000) // 3 s entfernen -> 7 s bleiben
    s.applyCut()
    expect(s.durationMs).toBe(7000)
  })

  it('verhindert das Entfernen der gesamten Datei', () => {
    const s = useAudioCutterStore()
    s.setDecoded(meta, decoded, null)
    s.patchExportOptions({ cutMode: 'remove' })
    s.setRegion(0, 10_000) // alles entfernen
    expect(s.canCut).toBe(false)
  })

  it('invalidiert ein Export-Ergebnis nach einem weiteren Schnitt', () => {
    const s = useAudioCutterStore()
    s.setDecoded(meta, decoded, null)
    s.setRegion(0, 5000)
    s.applyCut()
    s.setResult({
      blob: new Blob(['x']),
      filename: 'song_cut.wav',
      format: 'wav',
      durationMs: 5000,
    })
    expect(s.result).not.toBeNull()
    s.setRegion(0, 2000)
    s.applyCut()
    expect(s.result).toBeNull()
    expect(s.status).toBe('idle')
  })
})

describe('audioCutter store · Undo/Redo', () => {
  // Zeit steuern, damit die 600ms-Zusammenfassung deterministisch testbar ist.
  let now = 1000
  beforeEach(() => {
    setActivePinia(createPinia())
    now = 1000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
  })
  afterEach(() => vi.restoreAllMocks())
  const advance = (ms = 1000) => {
    now += ms
  }

  it('macht Region-Änderung rückgängig und stellt sie wieder her', () => {
    const s = useAudioCutterStore()
    s.setDecoded(meta, decoded, null)
    expect(s.canUndo).toBe(false)
    advance()
    s.setStart(2000)
    expect(s.region.startMs).toBe(2000)
    expect(s.canUndo).toBe(true)
    s.undo()
    expect(s.region.startMs).toBe(0)
    expect(s.canRedo).toBe(true)
    s.redo()
    expect(s.region.startMs).toBe(2000)
  })

  it('fasst schnelle gleichartige Änderungen zu einem Schritt zusammen', () => {
    const s = useAudioCutterStore()
    s.setDecoded(meta, decoded, null)
    advance()
    s.setStart(1000)
    s.setStart(2000) // gleiches Label, innerhalb Zeitfenster -> zusammengefasst
    s.setStart(3000)
    expect(s.region.startMs).toBe(3000)
    s.undo()
    expect(s.region.startMs).toBe(0)
    expect(s.canUndo).toBe(false)
  })

  it('erzeugt nach dem Zeitfenster getrennte Schritte', () => {
    const s = useAudioCutterStore()
    s.setDecoded(meta, decoded, null)
    advance()
    s.setStart(1000)
    advance(700) // > 600ms -> neuer Schritt
    s.setStart(2000)
    s.undo()
    expect(s.region.startMs).toBe(1000)
    s.undo()
    expect(s.region.startMs).toBe(0)
  })

  it('verwirft den Redo-Stapel bei neuer Änderung', () => {
    const s = useAudioCutterStore()
    s.setDecoded(meta, decoded, null)
    advance()
    s.setStart(2000)
    s.undo()
    expect(s.canRedo).toBe(true)
    advance()
    s.setStart(5000)
    expect(s.canRedo).toBe(false)
  })

  it('erfasst auch Export-Optionen', () => {
    const s = useAudioCutterStore()
    s.setDecoded(meta, decoded, null)
    advance()
    s.patchExportOptions({ fadeInMs: 500 })
    expect(s.exportOptions.fadeInMs).toBe(500)
    s.undo()
    expect(s.exportOptions.fadeInMs).toBe(0)
  })

  it('leert die Historie bei neuer Datei und reset', () => {
    const s = useAudioCutterStore()
    s.setDecoded(meta, decoded, null)
    advance()
    s.setStart(2000)
    expect(s.canUndo).toBe(true)
    s.setDecoded(meta, decoded, null)
    expect(s.canUndo).toBe(false)
  })
})
