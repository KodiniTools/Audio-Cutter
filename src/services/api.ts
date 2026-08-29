// src/services/api.ts
// Client für den Server-Modus. XHR statt fetch, um Upload-Fortschritt zu erhalten.

import type { CutResult, ExportOptions } from '../types/audio'

export interface ServerCutParams {
  file: File
  startMs: number
  endMs: number
  options: ExportOptions
}

export interface ServerCutHandlers {
  signal?: AbortSignal
  onProgress?: (fraction: number) => void
  timeoutMs?: number
}

/** Basis-URL des Backends (Vite-Env, Default = relativ zum Subdir). */
export function apiBaseUrl(): string {
  const env = (import.meta as unknown as { env?: Record<string, string> }).env
  return env?.VITE_API_BASE_URL?.replace(/\/$/, '') ?? '/audio-cutter/api'
}

function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(header)
  if (utf8) return decodeURIComponent(utf8[1])
  const plain = /filename="?([^";]+)"?/i.exec(header)
  return plain ? plain[1] : fallback
}

/**
 * Sendet die Datei zum Backend, das FFmpeg-basiert schneidet.
 * Robuste Fehlerbehandlung inkl. Timeout + Abbruch via AbortSignal.
 */
export function cutOnServer(
  params: ServerCutParams,
  handlers: ServerCutHandlers = {},
): Promise<CutResult> {
  const { file, startMs, endMs, options } = params
  const { signal, onProgress, timeoutMs = 120_000 } = handlers

  return new Promise<CutResult>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Abgebrochen', 'AbortError'))
      return
    }

    const xhr = new XMLHttpRequest()
    const url = `${apiBaseUrl()}/cut`
    xhr.open('POST', url, true)
    xhr.responseType = 'blob'
    xhr.timeout = timeoutMs

    const form = new FormData()
    form.append('startMs', String(Math.round(startMs)))
    form.append('endMs', String(Math.round(endMs)))
    form.append('format', options.format)
    form.append('mp3Bitrate', String(options.mp3Bitrate))
    form.append('fadeInMs', String(Math.round(options.fadeInMs)))
    form.append('fadeOutMs', String(Math.round(options.fadeOutMs)))
    form.append('mode', options.cutMode)
    form.append('file', file, file.name)

    const onAbort = () => xhr.abort()
    signal?.addEventListener('abort', onAbort)
    const cleanup = () => signal?.removeEventListener('abort', onAbort)

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total)
    }

    xhr.onload = () => {
      cleanup()
      if (xhr.status >= 200 && xhr.status < 300) {
        const blob = xhr.response as Blob
        const stem = file.name.replace(/\.[^.]+$/, '') || 'audio'
        const fallback = `${stem}_cut.${options.format}`
        const filename = filenameFromDisposition(
          xhr.getResponseHeader('Content-Disposition'),
          fallback,
        )
        resolve({
          blob,
          filename,
          format: options.format,
          durationMs: Math.max(0, endMs - startMs),
        })
      } else {
        // Fehlerantwort ist evtl. JSON im Blob -> auslesen.
        readBlobError(xhr.response, xhr.status).then(reject, reject)
      }
    }

    xhr.onerror = () => {
      cleanup()
      reject(new Error('Netzwerkfehler beim Upload.'))
    }
    xhr.ontimeout = () => {
      cleanup()
      reject(new Error('Zeitüberschreitung – Datei evtl. zu groß.'))
    }
    xhr.onabort = () => {
      cleanup()
      reject(new DOMException('Abgebrochen', 'AbortError'))
    }

    xhr.send(form)
  })
}

async function readBlobError(response: unknown, status: number): Promise<Error> {
  try {
    if (response instanceof Blob) {
      const text = await response.text()
      const json = JSON.parse(text) as { error?: string }
      if (json.error) return new Error(json.error)
    }
  } catch {
    /* ignore */
  }
  return new Error(`Serverfehler (${status}).`)
}

/** Health-Check für Modus-Umschaltung. */
export async function serverAvailable(timeoutMs = 4000): Promise<boolean> {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${apiBaseUrl()}/health`, { signal: controller.signal })
    return res.ok
  } catch {
    return false
  } finally {
    clearTimeout(t)
  }
}
