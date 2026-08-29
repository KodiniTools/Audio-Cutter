// src/i18n/locales/de.ts
// Deutsche Übersetzungen. Diese Datei ist die Schema-Quelle (typeof de -> MessageSchema).
// Bewusst OHNE `as const`: sonst würden die EN-Werte gegen die DE-Literale geprüft.
// Die Key-Struktur (für typsichere t()-Pfade) bleibt auch mit string-Werten erhalten.

export default {
  app: {
    title: 'Audio-Schneider',
    badge: '·ms',
    subtitle:
      'Millisekunden-genau schneiden – lokal im Browser oder serverseitig für große Dateien.',
    footer: 'Privacy First · Browser-Modus verarbeitet Dateien ohne Upload.',
  },
  lang: {
    label: 'Sprache',
    de: 'DE',
    en: 'EN',
  },
  meta: {
    channels: 'Kanäle',
    changeFile: 'andere Datei',
  },
  dropzone: {
    dragHint: 'Audiodatei hierher ziehen oder',
    browse: 'auswählen',
    formats: 'WAV, MP3, OGG, FLAC, M4A – die Verarbeitung bleibt lokal im Browser.',
  },
  waveform: {
    hint: 'Ziehen zum Markieren · Ränder ziehen zum Feinjustieren · Klick = Abspielpunkt · Mausrad = Zoom · Shift+Mausrad = Verschieben',
    zoomIn: 'Reinzoomen',
    zoomOut: 'Rauszoomen',
    zoomReset: 'Zoom zurücksetzen',
    followMarker: 'Marker folgen',
    total: 'Gesamtdauer',
    cursor: 'Cursor',
    remaining: 'Restdauer',
  },
  player: {
    play: 'Abspielen',
    pause: 'Pause',
    resume: 'Fortsetzen',
    stop: 'Stopp',
    preview: 'Vorschau',
    cursorAt: 'Cursor bei',
    setStart: 'Als Anfang',
    setEnd: 'Als Ende',
  },
  time: {
    start: 'Start',
    end: 'Ende',
    placeholder: 'mm:ss.mmm',
    selection: 'Auswahl:',
    valid: '✓ gültig',
    reset: 'Auswahl zurücksetzen',
  },
  export: {
    title: 'Export',
    processingLabel: 'Verarbeitung',
    cutModeLabel: 'Aktion',
    cutModes: {
      keep: { label: 'Auswahl behalten', hint: 'nur den Bereich exportieren' },
      remove: { label: 'Auswahl entfernen', hint: 'Bereich löschen, Rest verbinden' },
    },
    format: 'Format',
    bitrate: 'Bitrate: {value} kbps',
    fadeIn: 'Fade-In (ms)',
    fadeOut: 'Fade-Out (ms)',
    submit: 'Schneiden & Exportieren',
    cancel: 'Abbrechen',
    download: '{name} herunterladen',
    delete: 'Löschen',
    modes: {
      browser: { label: 'Browser', hint: 'lokal · privat' },
      server: { label: 'Server', hint: 'große Dateien · FFmpeg' },
    },
  },
  overlay: {
    title: 'Wird geschnitten …',
    hint: 'Bitte warten, während die Auswahl verarbeitet wird.',
  },
  validation: {
    noAudio: 'Keine Audiodaten geladen.',
    nonFinite: 'Start/Ende müssen gültige Zahlen sein.',
    negativeStart: 'Start darf nicht negativ sein.',
    endBeyond: 'Ende liegt hinter dem Dateiende.',
    endBeforeStart: 'Ende muss nach dem Start liegen.',
  },
  errors: {
    decodeFailed: 'Datei konnte nicht dekodiert werden (nicht unterstütztes Format?).',
    emptyRegion: 'Ausgewählter Bereich ist leer.',
    aborted: 'Abgebrochen.',
    noSourceFile: 'Keine Quelldatei für den Server-Modus vorhanden.',
    noDecodedData: 'Keine dekodierten Daten vorhanden.',
    loadUnknown: 'Unbekannter Fehler beim Laden.',
    processFailed: 'Verarbeitung fehlgeschlagen.',
  },
}
