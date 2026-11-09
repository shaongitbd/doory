import { useMemo } from 'react'
import type { DocPage } from '@/types/document'
import { useDocument, useEditorState } from '../context'
import { normalizeColor } from '../engine/colors'
import type { ElementColorMap } from '../engine/objects/elements'
import { elementColors } from '../toolbar/kinds'

/** Current colors of editable vector illustrations on the active page. */
export function canvasIllustrationColors(page: DocPage, limit = 10): string[] {
  const colors = new Set<string>()
  for (const object of [...page.objects].reverse()) {
    if (object.visible === false || typeof object.elementId !== 'string') continue
    const map = object.colorMap && typeof object.colorMap === 'object' ? object.colorMap as ElementColorMap : {}
    for (const original of elementColors(object)) {
      const current = map[original]
      const painted = current && typeof current !== 'string' ? current.stops.map((stop) => stop.color) : [current ?? original]
      for (const color of painted) {
        colors.add(normalizeColor(color))
        if (colors.size >= limit) return [...colors]
      }
    }
  }
  return [...colors]
}

export function useCanvasIllustrationColors(): string[] {
  const doc = useDocument()
  const pageId = useEditorState((state) => state.activePageId)
  return useMemo(() => {
    const page = doc.pages.find((item) => item.id === pageId)
    return page ? canvasIllustrationColors(page) : []
  }, [doc, pageId])
}
