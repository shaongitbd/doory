import { activateLocale } from '@/i18n/catalog'
import { setLocale } from '@/i18n/locale'
import { AudioFileError } from './files'
import { AudioLoadError, type LoadFailure } from './sources'
import { type RecorderFailure } from './recorder'
import { audioErrorMessage, recordingErrorMessage } from './messages'

beforeAll(async () => { await activateLocale('de') })
afterAll(() => setLocale('en'))

it.each([
  ['denied', 'Der Mikrofonzugriff wurde blockiert.'],
  ['blocked', 'Diese Seite darf das Mikrofon nicht verwenden.'],
  ['no-device', 'Kein Mikrofon gefunden.'],
  ['busy', 'Das Mikrofon wird von einer anderen App'],
  ['unsupported', 'Dieser Browser kann kein Audio aufnehmen.'],
  ['failed', 'Die Aufnahme konnte nicht erstellt werden.'],
] satisfies Array<[RecorderFailure, string]>)('localizes recording failure %s', (code, expected) => {
  expect(recordingErrorMessage(code)).toContain(expected)
})

it.each([
  ['empty', 'Diese Datei ist leer.'],
  ['type', 'Dieser Dateityp wird nicht unterstützt.'],
  ['size', 'Diese Datei ist zu groß.'],
] as const)('maps file error %s without displaying its internal message', (code, expected) => {
  const message = audioErrorMessage(new AudioFileError('PRIVATE /internal/secret.wav', code), 'Please try again.')
  expect(message).toContain(expected)
  expect(message).not.toContain('PRIVATE')
})

it.each(['network', 'missing', 'decode', 'unsupported', 'too-long', 'blocked'] satisfies LoadFailure[])('maps load error %s without displaying internals', code => {
  const message = audioErrorMessage(new AudioLoadError(code, 'PRIVATE internal detail'), 'Please try again.')
  expect(message).not.toContain('PRIVATE')
  expect(message).not.toBe('Bitte versuche es erneut.')
})

it('uses the translated fallback for an unknown exception', () => {
  expect(audioErrorMessage(new Error('PRIVATE stack trace'), 'Please try again.')).toBe('Bitte versuche es erneut.')
})
