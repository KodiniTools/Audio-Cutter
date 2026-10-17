import { describe, expect, it } from 'vitest'
import { formatsForMode, isBrowserFormat } from '../src/utils/formats'

describe('formats', () => {
  it('Browser ohne WebCodecs: WAV, MP3, FLAC', () => {
    expect(formatsForMode('browser')).toEqual(['wav', 'mp3', 'flac'])
  })

  it('Browser mit erkannten WebCodecs-Formaten ergänzt AAC/Opus, nie OGG', () => {
    expect(formatsForMode('browser', ['aac', 'webm'])).toEqual([
      'wav',
      'mp3',
      'aac',
      'webm',
      'flac',
    ])
    expect(formatsForMode('browser', ['webm'])).toEqual(['wav', 'mp3', 'webm', 'flac'])
    expect(isBrowserFormat('ogg', ['ogg'])).toBe(false)
  })

  it('Server bietet alle Formate', () => {
    expect(formatsForMode('server')).toEqual(['wav', 'mp3', 'ogg', 'aac', 'webm', 'flac'])
  })
})
