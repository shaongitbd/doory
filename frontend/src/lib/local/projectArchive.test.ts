import { Blob as NodeBlob } from 'node:buffer'
import { strToU8, zipSync } from 'fflate'
import { createBlankDocument } from '@/lib/document'
import { collectLocalAssetIds } from '@/lib/document'
import { LocalRepository } from './repository'
import { createMemoryStore } from './store'
import { exportLocalProject, importLocalProject, ProjectArchiveError } from './projectArchive'

const ASSET_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

const blob = (parts: string[], type = ''): Blob => new NodeBlob(parts, { type }) as unknown as Blob

function repository(): LocalRepository {
  return new LocalRepository(async () => ({ store: createMemoryStore(), mode: 'indexeddb' }))
}

async function text(value: Blob): Promise<string> {
  if (typeof value.text === 'function') return value.text()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsText(value)
  })
}

describe('local project backups', () => {
  it('round-trips the editable document, thumbnail and referenced browser assets with fresh ids', async () => {
    const source = repository()
    await source.putAsset({ id: ASSET_ID, blob: blob(['picture'], 'image/png'), name: 'portrait.png', mime: 'image/png', width: 640, height: 480 })
    const document = createBlankDocument(800, 600)
    document.pages[0].objects = [{ id: 'photo', type: 'image', src: `idb://${ASSET_ID}` }]
    const saved = await source.createDesign({ title: 'Café poster', document, thumbnail: blob(['thumb'], 'image/webp') })

    const backup = await exportLocalProject(saved.id, source)
    expect(backup.filename).toBe('Cafe-poster.doory')
    expect(backup.blob.type).toBe('application/vnd.doory.project+zip')

    const target = repository()
    const restored = await importLocalProject(backup.blob, target)
    const [restoredAssetId] = collectLocalAssetIds(restored.document)
    expect(restored).toMatchObject({ title: 'Café poster' })
    expect(restored.id).not.toBe(saved.id)
    expect(restoredAssetId).not.toBe(ASSET_ID)
    expect(restored.document.pages[0].objects[0].src).toBe(`idb://${restoredAssetId}`)
    expect(await text((await target.getAsset(restoredAssetId))!.blob)).toBe('picture')
    expect(await text(restored.thumbnail!)).toBe('thumb')
  })

  it('refuses to export an incomplete design instead of producing a broken backup', async () => {
    const repo = repository()
    const document = createBlankDocument(100, 100)
    document.pages[0].objects = [{ id: 'missing', type: 'image', src: `idb://${ASSET_ID}` }]
    const design = await repo.createDesign({ title: 'Missing file', document })
    await expect(exportLocalProject(design.id, repo)).rejects.toThrow(/missing from browser storage/)
  })

  it('rejects malformed archives and unsupported backup versions without writing anything', async () => {
    const repo = repository()
    await expect(importLocalProject(blob(['not a zip']), repo)).rejects.toBeInstanceOf(ProjectArchiveError)
    const archive = zipSync({
      'project.json': strToU8(JSON.stringify({ format: 'doory-project', version: 99, title: 'Future', document: createBlankDocument(10, 10), assets: [] })),
    })
    const bytes = archive.buffer.slice(archive.byteOffset, archive.byteOffset + archive.byteLength) as ArrayBuffer
    await expect(importLocalProject(new Blob([bytes]), repo)).rejects.toThrow(/not a supported Doory project backup/)
    expect(await repo.listDesigns()).toEqual([])
    expect(await repo.listAssets()).toEqual([])
  })
})
