import { describe, expect, it } from 'vitest'
import { parseSize, readSize, scaledPixels, sizeScale } from './size'

describe('parseSize', () => {
  it('reads a scale, a width or a height', () => {
    expect(parseSize('2x', 1080, 1350)).toBe(2)
    expect(parseSize(' 1.5 X ', 1080, 1350)).toBe(1.5)
    expect(parseSize('2×', 1080, 1350)).toBe(2)
    expect(parseSize('2', 1080, 1350)).toBe(2)
    expect(parseSize('1080w', 540, 675)).toBe(2)
    expect(parseSize('1350h', 1080, 1350)).toBe(1)
    expect(parseSize('.5x', 1080, 1350)).toBe(0.5)
  })

  it('gives each page size its own scale', () => {
    expect(parseSize('1080w', 1080, 1080)).toBe(1)
    expect(parseSize('1080w', 2160, 1080)).toBe(0.5)
  })

  it('refuses text that is not a size, and scales outside 0.1x to 4x', () => {
    for (const bad of ['', 'big', '2y', '0x', '-1x', '1080 px', '2xw']) expect(parseSize(bad, 1080, 1350)).toBeNull()
    expect(parseSize('5x', 1080, 1350)).toBeNull()
    expect(parseSize('8000w', 1080, 1350)).toBeNull()
    expect(parseSize('50w', 1080, 1350)).toBeNull()
    expect(parseSize('4x', 1080, 1350)).toBe(4)
    expect(parseSize('0.1x', 1080, 1350)).toBe(0.1)
  })

  it('tells the scale asked of a page even outside the limits', () => {
    expect(sizeScale('2000w', 400, 300)).toBe(5)
    expect(sizeScale('big', 400, 300)).toBeNull()
  })

  it('tells what was typed', () => {
    expect(readSize('1600w')).toEqual({ kind: 'w', value: 1600 })
    expect(readSize('3')).toEqual({ kind: 'x', value: 3 })
  })

  it('rounds the pixels like the renderer', () => {
    expect(scaledPixels(1080, 1350, 2 / 3)).toEqual({ width: 720, height: 900 })
  })
})
