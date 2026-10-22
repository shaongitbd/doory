import { describe, expect, it } from 'vitest'
import { scaledCrop } from './style'

describe('scaledCrop', () => {
  it('moves and enlarges the crop by the same factor as the whole image', () => {
    expect(scaledCrop({ x: 10, y: 20, width: 100, height: 50 }, 400, 300, 2)).toEqual({ x: 20, y: 40, width: 200, height: 100 })
  })

  it('scales a crop between pixels without rounding it', () => {
    expect(scaledCrop({ x: 10.25, y: 20.5, width: 100.5, height: 50.25 }, 400, 300, 2)).toEqual({ x: 20.5, y: 41, width: 201, height: 100.5 })
  })

  it('clamps the crop to the edges of the enlarged image after rounding', () => {
    const crop = scaledCrop({ x: 399, y: 299, width: 1, height: 1 }, 400, 300, 4)
    expect(crop).toEqual({ x: 1596, y: 1196, width: 4, height: 4 })
  })
})
