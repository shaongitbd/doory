/** The order in which folded sheets are printed. Page indexes refer to the selected pages, not the design. */
export type FoldLayout = 'booklet' | 'book'
export type Binding = 'left' | 'right'

export interface SheetSide {
  signature: number
  sheet: number
  side: 'front' | 'back'
  left: number | null
  right: number | null
}

/** Pair the outside of each signature first, then work inward toward its centre fold. */
export function imposePages(pageCount: number, layout: FoldLayout, signaturePages: number, binding: Binding): SheetSide[] {
  if (!Number.isSafeInteger(pageCount) || pageCount < 1) throw new Error('Select at least one page.')
  if (layout !== 'booklet' && layout !== 'book') throw new Error('Choose a folded layout.')
  if (binding !== 'left' && binding !== 'right') throw new Error('Choose a binding direction.')
  if (layout === 'book' && (!Number.isSafeInteger(signaturePages) || signaturePages < 4 || signaturePages > 32 || signaturePages % 4 !== 0)) {
    throw new Error('A signature must contain 4 to 32 pages, in multiples of 4.')
  }

  const groupSize = layout === 'booklet' ? Math.ceil(pageCount / 4) * 4 : signaturePages
  const result: SheetSide[] = []
  for (let start = 0, signature = 0; start < pageCount; start += groupSize, signature++) {
    const length = Math.min(groupSize, pageCount - start)
    const padded = Math.ceil(length / 4) * 4
    const at = (offset: number): number | null => offset < length ? start + offset : null
    for (let outer = 0; outer < padded / 4; outer++) {
      const first = outer * 2
      const last = padded - 1 - outer * 2
      const sheet = result.length / 2
      const pairs = [
        { side: 'front' as const, left: at(last), right: at(first) },
        { side: 'back' as const, left: at(first + 1), right: at(last - 1) },
      ]
      for (const pair of pairs) {
        result.push({
          signature: signature + 1,
          sheet,
          side: pair.side,
          left: binding === 'left' ? pair.left : pair.right,
          right: binding === 'left' ? pair.right : pair.left,
        })
      }
    }
  }
  return result
}
