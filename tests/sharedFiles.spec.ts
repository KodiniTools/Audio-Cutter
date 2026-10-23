import { describe, expect, it } from 'vitest'
import { SHARE_TARGETS, shareTargetUrl } from '../src/services/sharedFiles'

describe('shareTargetUrl', () => {
  it('öffnet den Audiokonverter mit Quellkennung', () => {
    expect(shareTargetUrl('converter')).toBe('/audiokonverter/?source=audio-cutter')
  })

  it('öffnet den Normalisierer direkt in der App', () => {
    expect(shareTargetUrl('normalizer')).toBe('/audionormalisierer/app?source=audio-cutter')
  })

  it('hat für jedes Ziel eine URL', () => {
    for (const target of SHARE_TARGETS) expect(shareTargetUrl(target)).toContain('?source=audio-cutter')
  })
})
