import { beforeEach, describe, expect, it } from 'vitest'
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
    expect(s.canProcess).toBe(false)
    expect(s.regionValidation.valid).toBe(false)
  })

  it('setDecoded initialisiert Region auf volle Länge', () => {
    const s = useAudioCutterStore()
    s.setDecoded(meta, decoded, null)
    expect(s.region.startMs).toBe(0)
    expect(s.region.endMs).toBe(10_000)
    expect(s.hasAudio).toBe(true)
    expect(s.canProcess).toBe(true)
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
