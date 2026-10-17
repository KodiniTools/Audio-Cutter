// src/utils/flacEncoder.ts
// Reiner FLAC-Encoder (verlustfrei, 16 bit) – ohne Browser-/WASM-Abhängigkeit,
// damit in Node testbar und im Worker lauffähig.
//
// Umfang (bewusst schlank, aber standardkonform):
// - feste Blockgröße (Default 4096), Subframes CONSTANT / VERBATIM / FIXED (Ordnung 0–4)
// - partitionierte Rice-Kodierung der Residuen
// - Stereo-Dekorrelation (links/rechts, links/side, side/rechts, mid/side)
// - STREAMINFO ohne MD5 (laut Spezifikation erlaubt: 0 = "unbekannt")

/** Maximal von FLAC unterstützte Kanalzahl. */
export const FLAC_MAX_CHANNELS = 8
export const FLAC_DEFAULT_BLOCK_SIZE = 4096
const BITS_PER_SAMPLE = 16
/** Höchster Rice-Parameter bei Methode 0 (4-bit; 15 wäre "Escape"). */
const MAX_RICE_PARAM = 14
const MAX_PARTITION_ORDER = 8
const MAX_FIXED_ORDER = 4

export interface FlacEncodeOptions {
  blockSize?: number
  onProgress?: (fraction: number) => void
}

/** Byte-Puffer mit Bit-Schreiber (MSB zuerst), wächst bei Bedarf. */
export class BitWriter {
  private buf: Uint8Array<ArrayBuffer>
  private pos = 0
  private acc = 0
  private nbits = 0

  constructor(initialBytes = 1 << 16) {
    this.buf = new Uint8Array(Math.max(16, initialBytes))
  }

  /** Anzahl bereits vollständig geschriebener Bytes. */
  get bytePos(): number {
    return this.pos
  }

  private pushByte(b: number): void {
    if (this.pos >= this.buf.length) {
      const next = new Uint8Array(this.buf.length * 2)
      next.set(this.buf)
      this.buf = next
    }
    this.buf[this.pos++] = b
  }

  /** Schreibt die unteren n Bits (0..32) von value (als vorzeichenlose Zahl). */
  writeBits(value: number, n: number): void {
    if (n === 0) return
    if (n > 16) {
      this.writeBits((value >>> 16) & ((1 << (n - 16)) - 1), n - 16)
      this.writeBits(value & 0xffff, 16)
      return
    }
    this.acc = (this.acc << n) | (value & ((1 << n) - 1))
    this.nbits += n
    while (this.nbits >= 8) {
      this.nbits -= 8
      this.pushByte((this.acc >>> this.nbits) & 0xff)
    }
    this.acc &= (1 << this.nbits) - 1
  }

  /** Vorzeichenbehaftete Zahl im Zweierkomplement mit n Bits. */
  writeSigned(value: number, n: number): void {
    this.writeBits(value < 0 ? value + 2 ** n : value, n)
  }

  /** Unär: q Nullen, gefolgt von einer 1. */
  writeUnary(q: number): void {
    while (q >= 16) {
      this.writeBits(0, 16)
      q -= 16
    }
    this.writeBits(1, q + 1)
  }

  /** Bis zur nächsten Byte-Grenze mit Nullen auffüllen. */
  alignToByte(): void {
    if (this.nbits > 0) this.writeBits(0, 8 - this.nbits)
  }

  /** Lesezugriff auf bereits geschriebene Bytes (für CRCs). */
  bytes(start: number, end: number): Uint8Array {
    return this.buf.subarray(start, end)
  }

  /** Ergebnis als exakt zugeschnittene Kopie. */
  finish(): Uint8Array<ArrayBuffer> {
    this.alignToByte()
    return this.buf.slice(0, this.pos)
  }
}

const CRC8_TABLE = buildCrcTable(0x07, 8)
const CRC16_TABLE = buildCrcTable(0x8005, 16)

function buildCrcTable(poly: number, width: 8 | 16): Uint16Array {
  const table = new Uint16Array(256)
  const top = 1 << (width - 1)
  const mask = (1 << width) - 1
  for (let i = 0; i < 256; i++) {
    let c = i << (width - 8)
    for (let b = 0; b < 8; b++) c = c & top ? ((c << 1) ^ poly) & mask : (c << 1) & mask
    table[i] = c
  }
  return table
}

export function crc8(data: Uint8Array): number {
  let c = 0
  for (let i = 0; i < data.length; i++) c = CRC8_TABLE[c ^ data[i]]
  return c
}

export function crc16(data: Uint8Array): number {
  let c = 0
  for (let i = 0; i < data.length; i++) c = ((c << 8) & 0xffff) ^ CRC16_TABLE[(c >>> 8) ^ data[i]]
  return c
}

/** Fixe Prädiktor-Residuen der Ordnung 0–4 (Ergebnis-Länge n − order). */
function fixedResiduals(x: Int32Array, order: number, out: Int32Array): void {
  const n = x.length
  switch (order) {
    case 0:
      for (let i = 0; i < n; i++) out[i] = x[i]
      break
    case 1:
      for (let i = 1; i < n; i++) out[i - 1] = x[i] - x[i - 1]
      break
    case 2:
      for (let i = 2; i < n; i++) out[i - 2] = x[i] - 2 * x[i - 1] + x[i - 2]
      break
    case 3:
      for (let i = 3; i < n; i++) out[i - 3] = x[i] - 3 * x[i - 1] + 3 * x[i - 2] - x[i - 3]
      break
    case 4:
      for (let i = 4; i < n; i++)
        out[i - 4] = x[i] - 4 * x[i - 1] + 6 * x[i - 2] - 4 * x[i - 3] + x[i - 4]
      break
    default:
      throw new Error(`Ungültige Prädiktor-Ordnung ${order}`)
  }
}

const zigzag = (r: number): number => (r >= 0 ? 2 * r : -2 * r - 1)

/** Geschätzte Rice-Kosten aus der Summe der (zigzag-)Werte einer Partition. */
function riceFromSum(sum: number, n: number): { k: number; bits: number } {
  if (n === 0) return { k: 0, bits: 0 }
  const mean = sum / n
  const guess = mean < 1 ? 0 : Math.min(MAX_RICE_PARAM, Math.floor(Math.log2(mean)))
  let best = { k: 0, bits: Infinity }
  for (let k = Math.max(0, guess - 1); k <= Math.min(MAX_RICE_PARAM, guess + 1); k++) {
    const bits = n * (k + 1) + Math.floor(sum / 2 ** k)
    if (bits < best.bits) best = { k, bits }
  }
  return best
}

interface ResidualPlan {
  partitionOrder: number
  params: number[]
  /** Geschätzte Bits inkl. Methoden-/Ordnungsfeld und Rice-Parametern. */
  bits: number
}

/**
 * Wählt die Partitionsordnung mit den geringsten (geschätzten) Kosten.
 * Summen werden einmal auf feinster Ebene gebildet und nach oben zusammengefasst.
 */
function planResidual(u: Uint32Array, blockSize: number, predOrder: number): ResidualPlan {
  // Feinste zulässige Ordnung bestimmen.
  let maxP = 0
  while (
    maxP < MAX_PARTITION_ORDER &&
    blockSize % (1 << (maxP + 1)) === 0 &&
    blockSize / (1 << (maxP + 1)) > predOrder
  ) {
    maxP++
  }
  const parts = 1 << maxP
  const partLen = blockSize / parts
  let sums: number[] = new Array(parts).fill(0)
  let lens: number[] = new Array(parts).fill(0)
  let offset = 0
  for (let i = 0; i < parts; i++) {
    const len = i === 0 ? partLen - predOrder : partLen
    let s = 0
    for (let j = offset; j < offset + len; j++) s += u[j]
    sums[i] = s
    lens[i] = len
    offset += len
  }

  let best: ResidualPlan | null = null
  for (let p = maxP; p >= 0; p--) {
    let bits = 2 + 4
    const params: number[] = []
    for (let i = 0; i < sums.length; i++) {
      const r = riceFromSum(sums[i], lens[i])
      params.push(r.k)
      bits += 4 + r.bits
    }
    if (!best || bits < best.bits) best = { partitionOrder: p, params, bits }
    if (p > 0) {
      const ns: number[] = []
      const nl: number[] = []
      for (let i = 0; i < sums.length; i += 2) {
        ns.push(sums[i] + sums[i + 1])
        nl.push(lens[i] + lens[i + 1])
      }
      sums = ns
      lens = nl
    }
  }
  return best as ResidualPlan
}

interface SubframePlan {
  kind: 'constant' | 'verbatim' | 'fixed'
  order: number
  residual: Uint32Array
  plan: ResidualPlan | null
  bits: number
}

/** Prädiktor-Ordnung mit kleinster Residuen-Betragssumme (eine Schleife je Ordnung). */
function bestFixedOrder(x: Int32Array): { order: number; absSum: number } {
  const n = x.length
  const maxOrder = Math.min(MAX_FIXED_ORDER, n - 1)
  const sums = [0, 0, 0, 0, 0]
  for (let i = 0; i < n; i++) {
    const e0 = x[i]
    sums[0] += Math.abs(e0)
    if (i < 1) continue
    const e1 = e0 - x[i - 1]
    sums[1] += Math.abs(e1)
    if (i < 2) continue
    const e2 = e1 - (x[i - 1] - x[i - 2])
    sums[2] += Math.abs(e2)
    if (i < 3) continue
    const e3 = e2 - (x[i - 1] - 2 * x[i - 2] + x[i - 3])
    sums[3] += Math.abs(e3)
    if (i < 4) continue
    const e4 = e3 - (x[i - 1] - 3 * x[i - 2] + 3 * x[i - 3] - x[i - 4])
    sums[4] += Math.abs(e4)
  }
  let order = 0
  for (let o = 1; o <= maxOrder; o++) {
    // Normiert auf die Anzahl Residuen, damit höhere Ordnungen fair verglichen werden.
    if (sums[o] / (n - o) < sums[order] / (n - order)) order = o
  }
  return { order, absSum: sums[order] }
}

/** Kostengünstigste Subframe-Darstellung eines Kanals ermitteln. */
function planSubframe(x: Int32Array, bps: number): SubframePlan {
  const n = x.length
  let constant = true
  for (let i = 1; i < n; i++) {
    if (x[i] !== x[0]) {
      constant = false
      break
    }
  }
  if (constant) {
    return { kind: 'constant', order: 0, residual: new Uint32Array(0), plan: null, bits: 8 + bps }
  }

  const verbatim: SubframePlan = {
    kind: 'verbatim',
    order: 0,
    residual: new Uint32Array(0),
    plan: null,
    bits: 8 + n * bps,
  }
  const { order } = bestFixedOrder(x)
  const res = new Int32Array(n)
  fixedResiduals(x, order, res)
  const len = n - order
  const u = new Uint32Array(len)
  for (let i = 0; i < len; i++) u[i] = zigzag(res[i])
  const plan = planResidual(u, n, order)
  const bits = 8 + order * bps + plan.bits
  return bits < verbatim.bits ? { kind: 'fixed', order, residual: u, plan, bits } : verbatim
}

function writeSubframe(w: BitWriter, x: Int32Array, bps: number, sf: SubframePlan): void {
  // 1 Bit Padding (0), 6 Bit Typ, 1 Bit "wasted bits" (0).
  if (sf.kind === 'constant') {
    w.writeBits(0b00000000, 8)
    w.writeSigned(x[0], bps)
    return
  }
  if (sf.kind === 'verbatim') {
    w.writeBits(0b00000010, 8)
    for (let i = 0; i < x.length; i++) w.writeSigned(x[i], bps)
    return
  }
  const plan = sf.plan as ResidualPlan
  w.writeBits((0b001000 | sf.order) << 1, 8)
  for (let i = 0; i < sf.order; i++) w.writeSigned(x[i], bps)
  w.writeBits(0, 2) // Rice-Methode 0 (4-bit-Parameter)
  w.writeBits(plan.partitionOrder, 4)
  const parts = 1 << plan.partitionOrder
  const partLen = x.length / parts
  let offset = 0
  for (let p = 0; p < parts; p++) {
    const k = plan.params[p]
    w.writeBits(k, 4)
    const len = p === 0 ? partLen - sf.order : partLen
    const mask = (1 << k) - 1
    for (let i = offset; i < offset + len; i++) {
      const v = sf.residual[i]
      w.writeUnary(v >>> k)
      if (k > 0) w.writeBits(v & mask, k)
    }
    offset += len
  }
}

/** Frame-Nummer im "UTF-8"-Schema der FLAC-Spezifikation. */
function writeUtf8Number(w: BitWriter, value: number): void {
  if (value < 0x80) {
    w.writeBits(value, 8)
    return
  }
  let bytes = 2
  while (bytes < 7 && value >= 2 ** (5 * bytes + 1)) bytes++
  const lead = (0xff00 >> bytes) & 0xff
  w.writeBits(lead | Math.floor(value / 2 ** (6 * (bytes - 1))), 8)
  for (let i = bytes - 2; i >= 0; i--) {
    w.writeBits(0x80 | (Math.floor(value / 2 ** (6 * i)) & 0x3f), 8)
  }
}

const SAMPLE_RATE_CODES: Record<number, number> = {
  88200: 1,
  176400: 2,
  192000: 3,
  8000: 4,
  16000: 5,
  22050: 6,
  24000: 7,
  32000: 8,
  44100: 9,
  48000: 10,
  96000: 11,
}

/** Samplerate-Code (4 Bit) plus evtl. angehängtes Feld am Header-Ende. */
function sampleRateField(rate: number): { code: number; extra?: { value: number; bits: number } } {
  const direct = SAMPLE_RATE_CODES[rate]
  if (direct !== undefined) return { code: direct }
  if (rate % 1000 === 0 && rate / 1000 <= 255)
    return { code: 12, extra: { value: rate / 1000, bits: 8 } }
  if (rate <= 0xffff) return { code: 13, extra: { value: rate, bits: 16 } }
  if (rate % 10 === 0 && rate / 10 <= 0xffff)
    return { code: 14, extra: { value: rate / 10, bits: 16 } }
  return { code: 0 } // aus STREAMINFO lesen
}

/**
 * Kodiert 16-bit-PCM-Kanäle verlustfrei als FLAC-Datei.
 * @param channels Ein Int16Array pro Kanal (gleich lang, 1–8 Kanäle).
 * @param sampleRate Samplerate in Hz (1–655350).
 */
export function encodeFlac(
  channels: Int16Array[],
  sampleRate: number,
  options: FlacEncodeOptions = {},
): Uint8Array<ArrayBuffer> {
  const { onProgress } = options
  const numChannels = channels.length
  if (numChannels < 1 || numChannels > FLAC_MAX_CHANNELS) {
    throw new Error(`FLAC unterstützt 1–${FLAC_MAX_CHANNELS} Kanäle (erhalten: ${numChannels}).`)
  }
  if (!Number.isInteger(sampleRate) || sampleRate < 1 || sampleRate > 655350) {
    throw new Error(`Ungültige Samplerate für FLAC: ${sampleRate}`)
  }
  const total = channels[0].length
  if (channels.some((c) => c.length !== total)) {
    throw new Error('Alle Kanäle müssen gleich lang sein.')
  }
  const blockSize = Math.min(
    Math.max(16, Math.round(options.blockSize ?? FLAC_DEFAULT_BLOCK_SIZE)),
    65535,
  )

  // Grobe Vorab-Größe (≈ 60 % von PCM), Puffer wächst bei Bedarf.
  const w = new BitWriter(Math.ceil(total * numChannels * 2 * 0.6) + 1024)

  // --- "fLaC" + STREAMINFO (einziger, letzter Metadatenblock) ---
  for (const ch of 'fLaC') w.writeBits(ch.charCodeAt(0), 8)
  w.writeBits(1, 1) // last-metadata-block
  w.writeBits(0, 7) // STREAMINFO
  w.writeBits(34, 24)
  const streamBlock = total > 0 ? Math.min(blockSize, Math.max(16, total)) : blockSize
  w.writeBits(streamBlock, 16) // min blocksize
  w.writeBits(streamBlock, 16) // max blocksize
  w.writeBits(0, 24) // min framesize (unbekannt)
  w.writeBits(0, 24) // max framesize (unbekannt)
  w.writeBits(sampleRate, 20)
  w.writeBits(numChannels - 1, 3)
  w.writeBits(BITS_PER_SAMPLE - 1, 5)
  w.writeBits(Math.floor(total / 2 ** 32), 4)
  w.writeBits(total >>> 0, 32)
  for (let i = 0; i < 16; i++) w.writeBits(0, 8) // MD5 unbekannt

  const rateField = sampleRateField(sampleRate)
  const numFrames = Math.ceil(total / blockSize)
  const work = Array.from({ length: numChannels }, () => new Int32Array(blockSize))

  for (let f = 0; f < numFrames; f++) {
    const start = f * blockSize
    const n = Math.min(blockSize, total - start)
    const block = work.map((buf, c) => {
      const view = buf.subarray(0, n)
      const src = channels[c]
      for (let i = 0; i < n; i++) view[i] = src[start + i]
      return view
    })

    // --- Kanal-Dekorrelation (nur Stereo) ---
    let assignment = numChannels - 1 // unabhängige Kanäle
    let subframes: { x: Int32Array; bps: number; plan: SubframePlan }[]
    if (numChannels === 2) {
      const [l, r] = block
      const side = new Int32Array(n)
      const mid = new Int32Array(n)
      for (let i = 0; i < n; i++) {
        side[i] = l[i] - r[i]
        mid[i] = (l[i] + r[i]) >> 1
      }
      // Modus per Residuen-Betragssumme schätzen, nur die zwei gewählten Kanäle planen.
      const cl = bestFixedOrder(l).absSum
      const cr = bestFixedOrder(r).absSum
      const cs = bestFixedOrder(side).absSum
      const cm = bestFixedOrder(mid).absSum
      const modes = [
        {
          a: 1,
          cost: cl + cr,
          sf: [
            { x: l, bps: 16 },
            { x: r, bps: 16 },
          ],
        },
        {
          a: 8,
          cost: cl + cs,
          sf: [
            { x: l, bps: 16 },
            { x: side, bps: 17 },
          ],
        },
        {
          a: 9,
          cost: cs + cr,
          sf: [
            { x: side, bps: 17 },
            { x: r, bps: 16 },
          ],
        },
        {
          a: 10,
          cost: cm + cs,
          sf: [
            { x: mid, bps: 16 },
            { x: side, bps: 17 },
          ],
        },
      ]
      const chosen = modes.reduce((a, b) => (b.cost < a.cost ? b : a))
      assignment = chosen.a
      subframes = chosen.sf.map((c) => ({ ...c, plan: planSubframe(c.x, c.bps) }))
    } else {
      subframes = block.map((x) => ({ x, bps: 16, plan: planSubframe(x, 16) }))
    }

    // --- Frame-Header ---
    const frameStart = w.bytePos
    w.writeBits(0b11111111111110, 14) // Sync
    w.writeBits(0, 1) // reserviert
    w.writeBits(0, 1) // feste Blockgröße
    const sizeCode = n === 4096 ? 12 : n === 4608 ? 5 : 7
    w.writeBits(sizeCode, 4)
    w.writeBits(rateField.code, 4)
    w.writeBits(assignment, 4)
    w.writeBits(0b100, 3) // 16 bit
    w.writeBits(0, 1) // reserviert
    writeUtf8Number(w, f)
    if (sizeCode === 7) w.writeBits(n - 1, 16)
    if (rateField.extra) w.writeBits(rateField.extra.value, rateField.extra.bits)
    w.writeBits(crc8(w.bytes(frameStart, w.bytePos)), 8)

    // --- Subframes + Footer ---
    for (const s of subframes) writeSubframe(w, s.x, s.bps, s.plan)
    w.alignToByte()
    w.writeBits(crc16(w.bytes(frameStart, w.bytePos)), 16)

    onProgress?.(Math.min(0.99, (f + 1) / numFrames))
  }

  onProgress?.(1)
  return w.finish()
}
