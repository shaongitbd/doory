import { afterEach, describe, expect, it } from 'vitest'
import { createBlankDocument } from '@/lib/document'
import { createMemoryAdapter } from '../../dev/memoryAdapter'
import { EditorEngine } from '../editor'
import { describeChoice, designPreset, loadLastExport, saveLastExport, suggestionFor, withOfferedOptimizer } from './choices'
import { DEFAULT_EXPORT_OPTIONS } from './registry'
import './formats'

let engine: EditorEngine | null = null
afterEach(() => {
  engine?.dispose()
  engine = null
  localStorage.clear()
})

function make(width: number, height: number, presetId: string, optimize = false): EditorEngine {
  const { adapter } = createMemoryAdapter()
  if (optimize) adapter.imageOptimize = { formats: ['png', 'jpg'], optimizers: [{ id: 'builtin', name: 'Built-in', formats: ['jpg', 'png'], sendsOffsite: false }], default: 'builtin' }
  engine = new EditorEngine({ adapter, document: { ...createBlankDocument(width, height), meta: { presetId } }, meta: { id: 'd', title: 'T', mode: 'account' }, ephemeral: true })
  return engine
}

describe('export choices', () => {
  it("suggests a JPG at the preset's size, optimized when the instance optimizes JPG by default", () => {
    const e = make(1080, 1920, 'instagram-story', true)
    const preset = designPreset(e)
    expect(preset?.id).toBe('instagram-story')
    const choice = suggestionFor(e, preset!)
    expect(choice).toMatchObject({ formatId: 'jpg', options: { size: '1x', quality: 0.82, qualityPreset: 'balanced', optimize: true } })
    expect(describeChoice(choice)).toBe('JPG · 1x · optimized')
  })

  it('suggests a PDF for a print size, and nothing once the page was resized', () => {
    const e = make(794, 1123, 'a4')
    expect(suggestionFor(e, designPreset(e)!).formatId).toBe('pdf')
    const resized = make(800, 1123, 'a4')
    expect(designPreset(resized)).toBeNull()
  })

  it('keeps the last download, and drops what it cannot read', () => {
    expect(loadLastExport()).toBeNull()
    saveLastExport({ formatId: 'webp', options: { ...DEFAULT_EXPORT_OPTIONS, size: '2x', optimize: true, optimizer: 'custom', maxBytes: 500_000, video: { format: 'mp4' } as never } })
    const last = loadLastExport()
    expect(last).toMatchObject({ formatId: 'webp', options: { size: '2x', optimize: true, optimizer: 'custom', maxBytes: 500_000 } })
    expect(last?.options.video).toBeUndefined()
    localStorage.setItem('doory-export-last', JSON.stringify({ formatId: 'bmp', options: {} }))
    expect(loadLastExport()).toBeNull()
    localStorage.setItem('doory-export-last', '{broken')
    expect(loadLastExport()).toBeNull()
    localStorage.setItem('doory-export-last', JSON.stringify({ formatId: 'png', options: { scale: 99, quality: 'x', transparent: 'yes' } }))
    expect(loadLastExport()?.options).toMatchObject({ scale: 1, quality: DEFAULT_EXPORT_OPTIONS.quality, transparent: false })
  })

  it('replaces an optimizer the server no longer offers with its default, and drops it without a server', () => {
    saveLastExport({ formatId: 'jpg', options: { ...DEFAULT_EXPORT_OPTIONS, optimize: true, optimizer: 'gone' } })
    const served = make(800, 600, '', true)
    expect(loadLastExport(served)?.options).toMatchObject({ optimize: true, optimizer: 'builtin' })
    expect(withOfferedOptimizer(served, { ...DEFAULT_EXPORT_OPTIONS, optimizer: 'builtin' }).optimizer).toBe('builtin')
    const alone = make(800, 600, '')
    expect(loadLastExport(alone)?.options).not.toHaveProperty('optimizer')
    // Without the editor, what was stored is read as it is.
    expect(loadLastExport()?.options.optimizer).toBe('gone')
  })
})
