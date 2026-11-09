import { IText } from 'fabric'
import type { EditorEngine } from '../engine/editor'

export interface FontPreview {
  /** Shows `stack` on the selected text without a history step. */
  preview(stack: string, family: string): void
  /** Puts the original font back (the picker was dismissed without a choice). */
  cancel(): void
  /** The choice was made through the normal style command: forget the original. */
  commit(): void
}

/**
 * Hover preview: scrubbing through the font list live-applies each font to the selected text
 * object, and only a click/Enter creates one history step. Previews are skipped while characters are being
 * edited (a choice then applies to the selected characters only).
 *style`.
 */
export function createFontPreview(editor: EditorEngine): FontPreview {
  let original: string | null = null
  let token = 0

  const target = (): IText | null => {
    const obj = editor.activeView()?.canvas.getActiveObject()
    return obj instanceof IText && !obj.isEditing ? obj : null
  }
  const refit = (obj: IText): void => {
    obj.initDimensions()
    obj.setCoords()
    obj.canvas?.requestRenderAll()
  }

  return {
    preview(stack, family) {
      const obj = target()
      if (!obj) return
      if (original === null) original = String(obj.fontFamily)
      const mine = ++token
      // With the text, so letters outside Latin (č, ř, ž…) load their files too.
      void editor.fonts.load(family, obj.fontWeight, obj.fontStyle, obj.text).then(() => {
        const live = target()
        if (mine !== token || !live) return
        live.set('fontFamily', stack)
        refit(live)
      })
    },
    cancel() {
      token += 1
      const obj = target()
      if (obj && original !== null) {
        obj.set('fontFamily', original)
        refit(obj)
      }
      original = null
    },
    commit() {
      token += 1
      original = null
    },
  }
}
