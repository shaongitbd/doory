import type { AssetRef } from '@/types/adapter'
import { afterEach, describe, expect, it } from 'vitest'
import { beginImageAssetDrag, endImageAssetDrag, hasImageAssetDrag, IMAGE_ASSET_DRAG_TYPE, readImageAssetDrag } from './imageAssetDrag'

function dataTransfer(): DataTransfer {
  const values = new Map<string, string>()
  const transfer = {
    dropEffect: 'none',
    effectAllowed: 'uninitialized',
    files: [],
    items: [],
    types: [] as string[],
    clearData(type?: string) {
      if (type) values.delete(type)
      else values.clear()
      this.types = [...values.keys()]
    },
    getData(type: string) {
      return values.get(type) ?? ''
    },
    setData(type: string, value: string) {
      values.set(type, value)
      this.types = [...values.keys()]
    },
    setDragImage() {},
  }
  return transfer as unknown as DataTransfer
}

const image: AssetRef = {
  id: 'asset-1',
  url: '/media/asset-1.png',
  thumbUrl: '/media/asset-1-thumb.png',
  width: 640,
  height: 480,
  name: 'asset-1.png',
  kind: 'image',
}

afterEach(endImageAssetDrag)

describe('image asset drag payload', () => {
  it('returns only the image registered by the matching in-page drag', () => {
    const transfer = dataTransfer()
    expect(beginImageAssetDrag(transfer, image)).toBe(true)
    expect(transfer.effectAllowed).toBe('copy')
    expect(hasImageAssetDrag(transfer)).toBe(true)
    expect(readImageAssetDrag(transfer)).toBe(image)

    const forged = dataTransfer()
    forged.setData(IMAGE_ASSET_DRAG_TYPE, 'another-token')
    expect(readImageAssetDrag(forged)).toBeNull()

    const second = dataTransfer()
    expect(beginImageAssetDrag(second, { ...image, id: 'asset-2' })).toBe(true)
    expect(readImageAssetDrag(transfer)).toBeNull()
    expect(readImageAssetDrag(second)?.id).toBe('asset-2')

    endImageAssetDrag()
    expect(readImageAssetDrag(second)).toBeNull()
  })

  it('does not start a grid drag for non-image assets', () => {
    const transfer = dataTransfer()
    expect(beginImageAssetDrag(transfer, { ...image, kind: 'audio' })).toBe(false)
    expect(hasImageAssetDrag(transfer)).toBe(false)
    expect(readImageAssetDrag(transfer)).toBeNull()
  })

  it('clears the active drag when the browser refuses the custom payload', () => {
    const current = dataTransfer()
    expect(beginImageAssetDrag(current, image)).toBe(true)
    const blocked = dataTransfer()
    blocked.setData = () => {
      throw new DOMException('blocked')
    }

    expect(beginImageAssetDrag(blocked, { ...image, id: 'asset-2' })).toBe(false)
    expect(readImageAssetDrag(current)).toBeNull()
  })
})
