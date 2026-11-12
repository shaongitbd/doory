import { describe, expect, it } from 'vitest'
import { foldedSheet, imposePages } from './imposition'

const labels = (count: number, layout: 'book' | 'booklet', signaturePages = 4, binding: 'left' | 'right' = 'left') =>
  imposePages(count, layout, signaturePages, binding).map(({ left, right }) => [left === null ? null : left + 1, right === null ? null : right + 1])

describe('folded sheet order', () => {
  it('puts the outside of an eight-page booklet first', () => {
    expect(labels(8, 'booklet')).toEqual([[8, 1], [2, 7], [6, 3], [4, 5]])
  })

  it('prints each book signature separately', () => {
    expect(labels(8, 'book')).toEqual([[4, 1], [2, 3], [8, 5], [6, 7]])
    expect(imposePages(8, 'book', 4, 'left').map(({ signature }) => signature)).toEqual([1, 1, 2, 2])
  })

  it('pads the end of the reading sequence without changing its pages', () => {
    expect(labels(6, 'booklet')).toEqual([[null, 1], [2, null], [6, 3], [4, 5]])
    expect(labels(6, 'book')).toEqual([[4, 1], [2, 3], [null, 5], [6, null]])
  })

  it('mirrors positions for right binding', () => {
    expect(labels(4, 'booklet', 4, 'right')).toEqual([[1, 4], [3, 2]])
  })

  it('rejects invalid counts and signatures', () => {
    expect(() => imposePages(0, 'booklet', 4, 'left')).toThrow()
    expect(() => imposePages(4, 'book', 6, 'left')).toThrow()
    expect(() => imposePages(4, 'book', 36, 'left')).toThrow()
  })

  it('places A5 leaves on an exact landscape A4 sheet', () => {
    const sheet = foldedSheet(559, 794)
    expect(sheet.width).toBeCloseTo(297 * 96 / 25.4)
    expect(sheet.height).toBeCloseTo(210 * 96 / 25.4)
    expect(sheet.x).toBeGreaterThan(0)
  })
})
