import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api/client'
import { describeExportFailure, isCancellation } from './exportFailure'
import { activateLocale } from '@/i18n/catalog'
import { setLocale } from '@/i18n/locale'
import { t } from '../../strings'

afterEach(() => setLocale('en'))

const api = (status: number, code: string, message = 'Server words', extra: Partial<ConstructorParameters<typeof ApiError>[0]> = {}) => new ApiError({ status, code, message, ...extra })

describe('what a failed download tells the user', () => {
  it.each(['de', 'zh-CN', 'zh-TW'] as const)('localizes every folded-PDF server validation error in %s', async locale => {
    await activateLocale(locale)
    const f = t.print.fold.errors
    for (const [source, message] of [
      ['Choose pages, a folded layout and a binding direction.', f.choices],
      ['Signature size must be a multiple of four from 4 to 32.', f.signature],
      ['Choose both, front or back sheet sides.', f.sides],
      ['Sheet sides require a folded layout.', f.foldedSides],
      ['Folded sheets cannot use bleed or crop marks at this paper size.', f.marks],
      ['Folded sheets need portrait pages of one size.', f.size],
      ['Folded layout is available for PDFs only.', f.pdfOnly],
    ]) {
      expect(message).not.toBe(source)
      expect(describeExportFailure(api(400, 'invalid_imposition', source))).toMatchObject({ kind: 'invalid', message, retryable: false })
    }
  })
  it('a busy print service: wait as long as it asked, then try again', () => {
    const failure = describeExportFailure(api(503, 'export_busy', 'busy', { retryAfter: 5 }))
    expect(failure).toMatchObject({ kind: 'busy', retryAfter: 5, retryable: true })
    expect(failure.message).toMatch(/busy/i)
  })

  it('a busy service that sent no wait is retried after five seconds', () => {
    expect(describeExportFailure(api(503, 'export_busy')).retryAfter).toBe(5)
  })

  it('a timeout may pass: retry, with advice to print fewer pages', () => {
    const failure = describeExportFailure(api(504, 'export_timeout'))
    expect(failure).toMatchObject({ kind: 'timeout', retryable: true, retryAfter: null })
    expect(failure.hint).toMatch(/fewer pages/i)
  })

  it('a missing browser on the server points to the standard PDF', () => {
    const failure = describeExportFailure(api(503, 'export_unavailable'))
    expect(failure.kind).toBe('unavailable')
    expect(failure.hint).toMatch(/standard PDF/i)
  })

  it('a server without print-quality PDF cannot be retried', () => {
    expect(describeExportFailure(api(404, 'server_pdf_disabled'))).toMatchObject({ kind: 'disabled', retryable: false })
  })

  it('a font the server cannot embed names what it said and cannot be retried', () => {
    const failure = describeExportFailure(api(400, 'invalid_font', 'A requested font file does not exist.'))
    expect(failure).toMatchObject({ kind: 'font', retryable: false })
    expect(failure.message).toContain('A requested font file does not exist.')
  })

  it('an unsafe page names the page the server found it on', () => {
    const failure = describeExportFailure(api(400, 'invalid_svg', 'Page 3 is not a valid, safe SVG.'))
    expect(failure).toMatchObject({ kind: 'page', message: 'Page 3 is not a valid, safe SVG.', retryable: false })
  })

  it('too large a design', () => {
    expect(describeExportFailure(api(413, 'payload_too_large')).kind).toBe('too-large')
    expect(describeExportFailure(api(413, 'something_else')).kind).toBe('too-large')
  })

  it('rate limits wait as told', () => {
    expect(describeExportFailure(api(429, 'throttled', 'Slow down', { retryAfter: 12 }))).toMatchObject({ kind: 'rate-limited', retryAfter: 12, retryable: true })
  })

  it('a lost session and a lost connection', () => {
    expect(describeExportFailure(api(401, 'not_authenticated'))).toMatchObject({ kind: 'signed-out', retryable: false })
    expect(describeExportFailure(api(0, 'network_error', 'We could not reach Doory.'))).toMatchObject({ kind: 'offline', retryable: true })
  })

  it('a rejected request shows the server field message', () => {
    const failure = describeExportFailure(api(400, 'validation_error', 'Invalid input.', { fields: { sizes: ['sizes must list exactly one size per page (3), got 2.'] } }))
    expect(failure.kind).toBe('invalid')
    expect(failure.message).toContain('exactly one size per page')
  })

  it('other server errors are a failed print, retryable', () => {
    expect(describeExportFailure(api(500, 'export_failed'))).toMatchObject({ kind: 'failed', retryable: true })
    expect(describeExportFailure(api(502, 'server_error'))).toMatchObject({ kind: 'failed', retryable: true })
  })

  it('browser-side failures keep their own message', () => {
    expect(describeExportFailure(new Error('An image in this design could not be embedded.')).message).toBe('An image in this design could not be embedded.')
    expect(describeExportFailure('nope').message).toBe('The export failed.')
  })

  it('a cancelled download is not a failure', () => {
    expect(isCancellation(new DOMException('Export cancelled', 'AbortError'))).toBe(true)
    expect(isCancellation(new Error('x'))).toBe(false)
  })
})
