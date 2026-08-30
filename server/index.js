// server/index.js
// Server-Modus des Audio-Schneiders: FFmpeg-basiert, ms-genau.
// Läuft unter PM2 (siehe ecosystem.config.cjs), Nginx proxied /audio-cutter/api/ -> hierher.
//
// Voraussetzung auf dem VPS: ffmpeg + ffprobe installiert (apt install ffmpeg).

import express from 'express'
import cors from 'cors'
import multer from 'multer'
import ffmpeg from 'fluent-ffmpeg'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT = Number(process.env.PORT) || 9016
const MAX_FILE_MB = Number(process.env.MAX_FILE_MB) || 300
const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT) || 2
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'https://kodinitools.com'
const FFMPEG_TIMEOUT_MS = Number(process.env.FFMPEG_TIMEOUT_MS) || 180_000

// Export-Formate -> FFmpeg-Codec/Container + Ausgabe-Metadaten.
// Voraussetzung: ffmpeg-Build mit libmp3lame, libvorbis, libopus, aac, flac
// (Standard bei `apt install ffmpeg`).
const FORMATS = {
  wav: { codec: 'pcm_s16le', container: 'wav', mime: 'audio/wav', ext: 'wav', lossy: false },
  mp3: { codec: 'libmp3lame', container: 'mp3', mime: 'audio/mpeg', ext: 'mp3', lossy: true },
  ogg: { codec: 'libvorbis', container: 'ogg', mime: 'audio/ogg', ext: 'ogg', lossy: true },
  aac: {
    codec: 'aac',
    container: 'mp4',
    mime: 'audio/mp4',
    ext: 'm4a',
    lossy: true,
    outputOptions: ['-movflags', '+faststart'],
  },
  webm: { codec: 'libopus', container: 'webm', mime: 'audio/webm', ext: 'webm', lossy: true },
  flac: { codec: 'flac', container: 'flac', mime: 'audio/flac', ext: 'flac', lossy: false },
}

const app = express()
app.use(cors({ origin: CORS_ORIGIN }))

const upload = multer({
  dest: tmpdir(),
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024, files: 1 },
})

// --- einfache Concurrency-Bremse gegen VPS-Überlastung ---
let inFlight = 0

/** Dauer (Sekunden) via ffprobe ermitteln. */
function probeDurationSec(path) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(path, (err, data) => {
      if (err) return reject(new Error('Datei nicht lesbar (ffprobe).'))
      const d = data?.format?.duration
      if (typeof d !== 'number' || !Number.isFinite(d)) {
        return reject(new Error('Dauer konnte nicht bestimmt werden.'))
      }
      resolve(d)
    })
  })
}

/** Positive endliche Zahl aus Formularfeld lesen. */
function num(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'audio-cutter-api', inFlight })
})

app.post('/cut', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Keine Datei empfangen.' })
  if (inFlight >= MAX_CONCURRENT) {
    await safeUnlink(req.file.path)
    return res.status(503).json({ error: 'Server ausgelastet – bitte kurz erneut versuchen.' })
  }

  inFlight++
  const inputPath = req.file.path
  let workDir = null
  let command = null
  let finished = false

  const cleanup = async () => {
    if (finished) return
    finished = true
    inFlight = Math.max(0, inFlight - 1)
    await safeUnlink(inputPath)
    if (workDir) await rm(workDir, { recursive: true, force: true }).catch(() => {})
  }

  try {
    const fmt = FORMATS[req.body.format] || FORMATS.wav
    const bitrate = Math.min(320, Math.max(96, Math.round(num(req.body.mp3Bitrate, 192))))
    const startMs = Math.max(0, num(req.body.startMs, 0))
    let endMs = Math.max(0, num(req.body.endMs, 0))
    const fadeInMs = Math.max(0, num(req.body.fadeInMs, 0))
    const fadeOutMs = Math.max(0, num(req.body.fadeOutMs, 0))

    // Serverseitig validieren – Client-Werten nicht blind vertrauen.
    const durationSec = await probeDurationSec(inputPath)
    const durationMs = durationSec * 1000
    if (endMs === 0 || endMs > durationMs) endMs = durationMs
    if (endMs <= startMs) {
      await cleanup()
      return res.status(400).json({ error: 'Ungültiger Bereich (Ende <= Start).' })
    }

    const mode = req.body.mode === 'remove' ? 'remove' : 'keep'
    const startSec = startMs / 1000
    const endSec = endMs / 1000
    const durSec = (endMs - startMs) / 1000

    // Im Entfernen-Modus: zu behaltende Segmente (Kopf + Rest) bestimmen.
    let removeSegments = null
    let removeOutDurSec = 0
    if (mode === 'remove') {
      removeSegments = []
      if (startSec > 0.0005) removeSegments.push([0, startSec])
      if (endSec < durationSec - 0.0005) removeSegments.push([endSec, durationSec])
      if (removeSegments.length === 0) {
        await cleanup()
        return res.status(400).json({ error: 'Nach dem Entfernen bliebe nichts übrig.' })
      }
      removeOutDurSec = removeSegments.reduce((a, [s, e]) => a + (e - s), 0)
    }

    workDir = await mkdtemp(join(tmpdir(), 'audiocut-'))
    const outName = `cut_${randomUUID()}.${fmt.ext}`
    const outputPath = join(workDir, outName)

    await new Promise((resolve, reject) => {
      command = ffmpeg(inputPath)

      if (mode === 'remove') {
        // Auswahl entfernen: Segmente per atrim herausschneiden und zusammenfügen.
        const parts = removeSegments.map(
          ([s, e], i) =>
            `[0:a]atrim=start=${s.toFixed(3)}:end=${e.toFixed(3)},asetpts=PTS-STARTPTS[s${i}]`,
        )
        let graph = parts.join(';')
        if (removeSegments.length === 1) {
          graph += ';[s0]anull[c]'
        } else {
          const labels = removeSegments.map((_, i) => `[s${i}]`).join('')
          graph += `;${labels}concat=n=${removeSegments.length}:v=0:a=1[c]`
        }
        const fades = []
        if (fadeInMs > 0) fades.push(`afade=t=in:st=0:d=${(fadeInMs / 1000).toFixed(3)}`)
        if (fadeOutMs > 0) {
          const fo = Math.max(0, removeOutDurSec - fadeOutMs / 1000)
          fades.push(`afade=t=out:st=${fo.toFixed(3)}:d=${(fadeOutMs / 1000).toFixed(3)}`)
        }
        let outLabel = 'c'
        if (fades.length) {
          graph += `;[c]${fades.join(',')}[out]`
          outLabel = 'out'
        }
        command.complexFilter(graph, [outLabel])
      } else {
        // Auswahl behalten: -ss vor -i + Re-Encode = schnell UND ms-genau.
        command.inputOptions(['-ss', startSec.toFixed(3)]).outputOptions(['-t', durSec.toFixed(3)])
        const filters = []
        if (fadeInMs > 0) filters.push(`afade=t=in:st=0:d=${(fadeInMs / 1000).toFixed(3)}`)
        if (fadeOutMs > 0) {
          const foStart = Math.max(0, durSec - fadeOutMs / 1000)
          filters.push(`afade=t=out:st=${foStart.toFixed(3)}:d=${(fadeOutMs / 1000).toFixed(3)}`)
        }
        if (filters.length) command.audioFilters(filters)
      }

      command.audioCodec(fmt.codec)
      if (fmt.lossy) command.audioBitrate(bitrate)
      if (fmt.outputOptions) command.outputOptions(fmt.outputOptions)
      command.format(fmt.container)

      const timer = setTimeout(() => {
        command.kill('SIGKILL')
        reject(new Error('FFmpeg-Zeitüberschreitung.'))
      }, FFMPEG_TIMEOUT_MS)

      command
        .on('error', (err) => {
          clearTimeout(timer)
          reject(new Error('FFmpeg-Fehler: ' + err.message))
        })
        .on('end', () => {
          clearTimeout(timer)
          resolve()
        })
        .save(outputPath)
    })

    // Abbruch durch Client zwischen Encode und Senden abfangen.
    if (req.aborted) {
      await cleanup()
      return
    }

    const info = await stat(outputPath)
    const downloadName = buildDownloadName(req.file.originalname, fmt.ext)
    res.setHeader('Content-Type', fmt.mime)
    res.setHeader('Content-Length', String(info.size))
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiName(downloadName)}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`,
    )

    res.download(outputPath, downloadName, async () => {
      await cleanup()
    })
  } catch (err) {
    if (command) command.kill('SIGKILL')
    await cleanup()
    if (!res.headersSent) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Serverfehler.' })
    }
  }
})

// Multer-/globale Fehler (z. B. Dateigröße) sauber als JSON.
app.use((err, _req, res, _next) => {
  const msg =
    err?.code === 'LIMIT_FILE_SIZE'
      ? `Datei zu groß (max. ${MAX_FILE_MB} MB).`
      : err?.message || 'Unerwarteter Fehler.'
  if (!res.headersSent) res.status(400).json({ error: msg })
})

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[audio-cutter-api] hört auf 127.0.0.1:${PORT}`)
})

// --- Helpers ---
async function safeUnlink(path) {
  await rm(path, { force: true }).catch(() => {})
}
function buildDownloadName(original, ext) {
  const stem = (original || 'audio').replace(/\.[^.]+$/, '').replace(/[/\\]/g, '_') || 'audio'
  return `${stem}_cut.${ext}`
}
function asciiName(name) {
  // Fallback-Dateiname ohne Nicht-ASCII (RFC 6266).
  return name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '')
}
