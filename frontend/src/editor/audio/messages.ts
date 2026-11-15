import { msg } from '@/i18n/catalog'
import { AudioFileError } from './files'
import { MAX_AUDIO_BYTES } from './model'
import type { RecorderFailure } from './recorder'
import { AudioLoadError } from './sources'

const RECORDING_ERRORS: Record<RecorderFailure, string> = {
  denied: 'Microphone access was blocked. Allow it for this site in your browser’s address bar, then try again.',
  blocked: 'This page is not allowed to use the microphone. Open Doory over HTTPS, or ask the site’s administrator to allow it.',
  'no-device': 'No microphone was found. Plug one in or check your system sound settings, then try again.',
  busy: 'The microphone is in use by another app or tab. Close it there, then try again.',
  unsupported: 'This browser cannot record audio. Try a current version of Chrome, Edge, Firefox or Safari.',
  failed: 'The recording could not be made. Try again.',
}

export function recordingErrorMessage(reason: RecorderFailure): string {
  return msg(RECORDING_ERRORS[reason])
}

/** Known failure codes are safe UI messages; arbitrary internal errors stay out of the interface. */
export function audioErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof AudioFileError) {
    switch (error.code) {
      case 'empty': return msg('That file is empty.')
      case 'type': return msg('That file type is not supported. Use MP3, OGG, WAV, M4A or WebM audio.')
      case 'size': return msg('That file is too large. Use a file up to {max} MB.', { max: Math.round(MAX_AUDIO_BYTES / 1048576) })
    }
  }
  if (error instanceof AudioLoadError) {
    switch (error.code) {
      case 'network': return msg('The audio could not be loaded. Check your connection.')
      case 'missing': return msg('This audio file is no longer available.')
      case 'decode': return msg('That file could not be read as audio. This browser may not support its format.')
      case 'unsupported': return msg('This browser cannot play or mix audio.')
      case 'too-long': return msg('This audio exceeds the size or duration limit.')
      case 'blocked': return msg('The browser blocked the sound. Press play again.')
    }
  }
  return msg(fallback)
}
