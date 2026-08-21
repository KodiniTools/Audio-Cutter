# Audio-Schneider (·ms)

Millisekunden-genauer Audio-Schneider als Vue-3-SPA für `kodinitools.com/audio-cutter/`.
Zwei Verarbeitungsmodi:

- **Browser (Default, Privacy First):** Web Audio API dekodiert die Datei, es wird
  **sample-genau** geschnitten (bei 44,1 kHz ≈ 0,023 ms pro Sample) und lokal als
  WAV (verlustfrei) oder MP3 (via `lamejs`) exportiert. **Kein Upload.**
  Das MP3-Encoding läuft in einem **Web Worker** (Main-Thread bleibt frei),
  mit echtem Fortschritt und Abbruch.
- **Server (optional):** Upload an ein Node/Express-Backend, das mit **FFmpeg**
  schneidet (`-ss` + Re-Encode = ms-genau). Für sehr große Dateien / schwache Geräte.

## Stack

Vue 3 (Composition API, `<script setup>`) · TypeScript strict · Pinia · Vue Router ·
vue-i18n (DE/EN) · Vite · Tailwind · Vitest.
Backend: Express + fluent-ffmpeg + multer (PM2, Port 9016).

## Architektur

Reine Logik ist von Browser-APIs getrennt und damit voll testbar:

```
src/utils/audioMath.ts     ms<->samples, Zeitformat/-parsing, Validierung   (pure)
src/utils/sliceBuffer.ts   sample-genaues Schneiden + lineare Fades          (pure)
src/utils/wavEncoder.ts    16-bit-PCM-WAV-Encoder                            (pure)
src/utils/waveform.ts      Min/Max-Peaks pro Pixel                           (pure)
src/utils/mp3Encoder.ts    MP3-Block-Encoding, Encoder injizierbar           (pure)
src/composables/useAudioEngine.ts   decode/cut/encode (Web Audio + lamejs)   (Browser)
src/composables/useMp3Worker.ts     Worker-Wrapper (Promise/Progress/Abort)  (Browser)
src/composables/useWaveform.ts      Canvas-Rendering                         (Browser)
src/workers/mp3.worker.ts  lamejs-Encoding im Worker-Thread
src/services/api.ts        Server-Modus-Client (XHR: Progress/Abort/Timeout)
src/stores/audioCutter.ts  Pinia single source of truth
src/i18n/                  vue-i18n-Setup + Kataloge (de.ts, en.ts)
src/components/            FileDropzone, WaveformEditor, TimeControls, ExportPanel
src/pages/AudioCutterPage.vue        Orchestrierung + Sprachumschalter
server/index.js            FFmpeg-Backend
```

**MP3-Worker:** `useAudioEngine.cut()` lagert das Encoding an `mp3.worker.ts` aus
(Kanaldaten werden per Transfer übergeben – kein Kopieren). Fällt bei fehlender
Worker-Unterstützung auf synchrones Encoding zurück. Die reine Block-Logik
(`utils/mp3Encoder.ts`) ist ohne `lamejs`-Import via injiziertem Encoder testbar.

**i18n:** `vue-i18n` (Composition API, `legacy: false`). Sprache: `localStorage`
→ `navigator.language` → `de`. Umschalter im Header (persistiert, setzt `<html lang>`).
Reine Utils bleiben sprachfrei: `validateRegion` liefert Fehler-**Codes**, das UI übersetzt.

## Entwicklung

```bash
npm install
npm run dev        # http://localhost:5173/audio-cutter/
npm run test       # Vitest (50 Tests: Mathe, Slicing, WAV, Peaks, Store, MP3-Blocks, i18n)
npm run build      # -> dist/  (base = /audio-cutter/)
```

## Deployment (VPS, wie gewohnt)

**Frontend:**

```bash
npm run build
# dist/ nach /var/www/kodinitools.com/audio-cutter/ hochladen (SCP/FileZilla)
```

**Backend (nur wenn Server-Modus genutzt wird):**

```bash
# ffmpeg muss vorhanden sein:
sudo apt-get install -y ffmpeg

# server/ nach /var/www/kodinitools.com/audio-cutter-api/ kopieren
cd /var/www/kodinitools.com/audio-cutter-api
npm install --omit=dev
pm2 start ecosystem.config.cjs
pm2 save
```

**Nginx:** Inhalt aus `deploy/nginx-audio-cutter.conf` in den `server{}`-Block
einfügen, dann `sudo nginx -t && sudo systemctl reload nginx`.

## Hinweise

- Der Browser-Modus braucht **kein** COOP/COEP (nutzt Web Audio + lamejs, kein
  SharedArrayBuffer) – deutlich einfacher zu deployen als FFmpeg.wasm.
- Der MP3-Worker wird von Vite automatisch als eigener Chunk gebündelt
  (`dist/assets/mp3.worker-*.js`) – keine zusätzliche Konfiguration nötig.
- **Deploy:** Vor dem Build einmal `npm install` ausführen (neue Dependency
  `vue-i18n`), dann wie gewohnt `npm run build` und `dist/` hochladen.
- Server-/FFmpeg-Fehlermeldungen kommen weiterhin auf Deutsch vom Backend und
  sind (noch) nicht i18n-übersetzt.
