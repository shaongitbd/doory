import { describe, expect, it } from 'vitest'
import { DEFAULT_EXPORT_OPTIONS } from '../../engine/export/registry'
import { apiFormat, describeCall, exportArguments } from './apiCall'

const base = { designId: 'd1', pages: 'all' as const, fileNames: 'simple' as const }

describe('the API / MCP preview', () => {
  it('writes a JPG at a quality stop, a typed size and the optimizer', () => {
    const args = exportArguments({ ...base, formatId: 'jpg', options: { ...DEFAULT_EXPORT_OPTIONS, size: '2×', qualityPreset: 'balanced', quality: 0.82, optimize: true, optimizer: 'builtin', progressive: true } })
    expect(args).toEqual({ design_id: 'd1', format: 'jpg', pages: 'all', size: '2x', quality: 'balanced', progressive: true, optimize: 'builtin' })
  })

  it('writes a number quality, a size cap and one page', () => {
    const args = exportArguments({ ...base, pages: [2], formatId: 'webp', options: { ...DEFAULT_EXPORT_OPTIONS, quality: 0.7, maxBytes: 1_000_000, transparent: true } })
    expect(args).toEqual({ design_id: 'd1', format: 'webp', page: 2, quality: 70, max_bytes: 1_000_000, transparent: true, optimize: false })
  })

  it('PNG: no quality, a palette when asked, detailed file names', () => {
    const args = exportArguments({ ...base, pages: [1, 3], fileNames: 'structured', formatId: 'png', options: { ...DEFAULT_EXPORT_OPTIONS, scale: 2, pngColors: 256, stripMetadata: false, optimize: true } })
    expect(args).toEqual({ design_id: 'd1', format: 'png', pages: [1, 3], scale: 2, png_colors: 256, strip_metadata: false, optimize: true, file_names: 'detailed' })
  })

  it('shows the MCP tool call and the REST request', () => {
    const text = describeCall({ ...base, formatId: 'png', options: DEFAULT_EXPORT_OPTIONS }, 'https://doory.example')
    expect(text).toContain('// MCP tool export_design')
    expect(text).toContain('POST https://doory.example/api/v1/designs/d1/export/image/')
    expect(text.split('// REST')[1]).not.toContain('design_id')
  })

  it('names the print-quality PDF as the API does, with its bleed and marks and none of the image options', () => {
    const options = { ...DEFAULT_EXPORT_OPTIONS, bleedMm: 3, cropMarks: true, scale: 2, optimize: true, qualityPreset: 'small' as const }
    expect(exportArguments({ ...base, formatId: 'pdf-server', options })).toEqual({ design_id: 'd1', format: 'pdf-print', pages: 'all', bleed_mm: 3, crop_marks: true })
    expect(exportArguments({ ...base, pages: [1], formatId: 'pdf', options: { ...options, bleedMm: 0, cropMarks: false } })).toEqual({ design_id: 'd1', format: 'pdf', page: 1 })
    expect(exportArguments({ ...base, fileNames: 'structured', formatId: 'svg', options })).toEqual({ design_id: 'd1', format: 'svg', pages: 'all', file_names: 'detailed' })
  })

  it('includes the chosen side in folded PDF examples', () => {
    const options = { ...DEFAULT_EXPORT_OPTIONS, imposition: { layout: 'booklet' as const, signaturePages: 8, binding: 'right' as const, sides: 'back' as const } }
    expect(exportArguments({ ...base, formatId: 'pdf-server', options })).toMatchObject({
      layout: 'booklet', signature_pages: 8, binding: 'right', print_sides: 'back',
    })
  })

  it('knows which formats the API makes', () => {
    expect(['png', 'avif', 'svg', 'pdf', 'pdf-server', 'mp4', 'toString'].map(apiFormat)).toEqual(['png', 'avif', 'svg', 'pdf', 'pdf-print', null, null])
  })
})
