// src/i18n/locales/en.ts
// English translations. Must mirror the key structure of de.ts (validated in tests).

import type { MessageSchema } from '../messages'

const en: MessageSchema = {
  app: {
    title: 'Audio Cutter',
    badge: '·ms',
    subtitle:
      'Cut with millisecond precision – locally in the browser or server-side for large files.',
    footer: 'Privacy First · Browser mode processes files without uploading.',
  },
  lang: {
    label: 'Language',
    de: 'DE',
    en: 'EN',
  },
  meta: {
    channels: 'channels',
    changeFile: 'change file',
  },
  dropzone: {
    dragHint: 'Drag an audio file here or',
    browse: 'browse',
    formats: 'WAV, MP3, OGG, FLAC, M4A – processing stays local in your browser.',
  },
  waveform: {
    hint: 'Drag to select · drag the edges to fine-tune',
  },
  player: {
    play: 'Play selection',
    stop: 'Stop',
  },
  time: {
    start: 'Start',
    end: 'End',
    placeholder: 'mm:ss.mmm',
    selection: 'Selection:',
    valid: '✓ valid',
  },
  export: {
    processingLabel: 'Processing',
    format: 'Format',
    bitrate: 'Bitrate: {value} kbps',
    fadeIn: 'Fade-in (ms)',
    fadeOut: 'Fade-out (ms)',
    submit: 'Cut & Export',
    cancel: 'Cancel',
    download: 'Download {name}',
    modes: {
      browser: { label: 'Browser', hint: 'local · private' },
      server: { label: 'Server', hint: 'large files · FFmpeg' },
    },
  },
  validation: {
    noAudio: 'No audio loaded.',
    nonFinite: 'Start/end must be valid numbers.',
    negativeStart: 'Start must not be negative.',
    endBeyond: 'End is past the end of the file.',
    endBeforeStart: 'End must be after the start.',
  },
  errors: {
    decodeFailed: 'File could not be decoded (unsupported format?).',
    emptyRegion: 'The selected range is empty.',
    aborted: 'Cancelled.',
    noSourceFile: 'No source file available for server mode.',
    noDecodedData: 'No decoded data available.',
    loadUnknown: 'Unknown error while loading.',
    processFailed: 'Processing failed.',
  },
}

export default en
