/**
 * Built-in object kinds, registered through the same public registry third parties use.
 * Importing this module registers them (idempotent).
 */
import { type FabricImage, type FabricObject, IText } from 'fabric'
import type { DocObject } from '@/types/document'
import { applyColorMap } from './elements'
import { applyCurve } from './curvedText'
import { applyEffects } from './effects'
import { applyImageFilters } from './filters'
import { applyMask } from './masks'
import { asDory } from './dory'
import { registerObjectKind, typeName as typeOf } from './kinds'
import { validSlot } from './slot'
import { readTextFit, refitTextbox, validFitFontSize } from './textStyle'
import { qrDataUrl } from './qr'
import { t } from '../../strings'
import { CLIP_PROPS, isClip } from '../../clips/model'


const TEXT_TYPES = new Set(['textbox', 'itext', 'text'])
const SHAPE_TYPES = new Set(['rect', 'ellipse', 'circle', 'triangle', 'polygon', 'polyline', 'path'])

async function prepareImage(json: DocObject, ctx: { resolveSrc(src: string): Promise<string> }): Promise<void> {
  const src = typeof json.src === 'string' ? json.src : ''
  json.docSrc = src
  json.src = src ? await ctx.resolveSrc(src) : ''
  json.crossOrigin = 'anonymous'
  if (json.slot !== undefined) {
    const slot = validSlot(json.slot)
    if (slot) json.slot = slot
    else delete json.slot
  }
  if (Array.isArray(json.filters)) json.filterSpecs = json.filters
  delete json.filters
  delete json.clipPath
}

function hydrateImage(obj: FabricObject): void {
  const d = asDory(obj)
  const img = obj as FabricImage
  if (d.filterSpecs && d.filterSpecs.length > 0) applyImageFilters(img, d.filterSpecs)
  applyMask(obj)
}

export function registerBuiltinKinds(): void {
  registerObjectKind({
    id: 'qr',
    label: t.kinds.qr,
    priority: 100,
    matches: (o) => !!o.qr,
    async prepare(json) {
      const qr = json.qr as { text: string; fg: string; bg: string }
      json.docSrc = ''
      json.src = await qrDataUrl(qr)
      json.crossOrigin = 'anonymous'
      delete json.filters
    },
    dehydrate(out) {
      delete out.src
      delete out.docSrc
    },
  })

  registerObjectKind({
    id: 'placeholder',
    label: t.kinds.placeholder,
    priority: 90,
    matches: (o) => o.isPlaceholder === true,
    hydrate: (obj) => applyMask(obj),
  })

  registerObjectKind({
    id: 'element',
    label: t.kinds.element,
    priority: 80,
    matches: (o) => typeof o.elementId === 'string',
    hydrate(obj) {
      const map = asDory(obj).colorMap
      if (map) applyColorMap(obj, map)
    },
  })

  // A video clip is a picture (its poster) that names a clip; it ranks above `image` so picture tools leave it alone.
  registerObjectKind({
    id: 'video',
    label: t.kinds.video,
    priority: 60,
    matches: (o) => isClip(o),
    extraProps: [...CLIP_PROPS],
    prepare: prepareImage,
    // Adjustments show on the poster here; the frame renderer draws them on every picture of the clip.
    hydrate: hydrateImage,
  })

  registerObjectKind({
    id: 'image',
    label: t.kinds.image,
    priority: 50,
    matches: (o) => typeOf(o) === 'image',
    prepare: prepareImage,
    hydrate: hydrateImage,
  })

  registerObjectKind({
    id: 'text',
    label: t.kinds.text,
    priority: 50,
    matches: (o) => TEXT_TYPES.has(typeOf(o)),
    hydrate(obj, json) {
      const d = asDory(obj)
      const amount = d.curveAmount
      if (obj instanceof IText && typeof amount === 'number' && amount !== 0) applyCurve(obj, amount)
      if (d.effects) applyEffects(obj, d.effects)
      if (obj instanceof IText) {
        const fit = readTextFit(json.fit)
        const userSize = validFitFontSize(json.fontSize !== undefined ? json.fontSize : obj.fontSize)
        if (fit && userSize !== null) {
          if (typeof json.width === 'number' && Number.isFinite(json.width) && json.width > 0) obj.width = json.width
          d.fit = fit
          d.userFontSize = userSize
          d.fitBoxHeight =
            typeof json.height === 'number' && Number.isFinite(json.height) && json.height > 0 ? json.height : obj.height
          refitTextbox(obj)
        } else {
          delete d.fit
          delete d.fitFontSize
          delete d.userFontSize
          delete d.fitBoxHeight
        }
      }
    },
    dehydrate(out, obj) {
      const d = asDory(obj)
      const fit = readTextFit(d.fit)
      if (fit && obj instanceof IText) {
        out.fit = fit
        const userSize = d.userFontSize ?? obj.fontSize
        out.fontSize = Number(userSize.toFixed(3))
        if (typeof d.fitBoxHeight === 'number' && d.fitBoxHeight > 0) {
          out.height = Number(d.fitBoxHeight.toFixed(3))
        }
        out.fitFontSize = Number((d.fitFontSize ?? obj.fontSize).toFixed(3))
      } else {
        delete out.fit
        delete out.fitFontSize
      }
    },
  })

  registerObjectKind({
    id: 'line',
    label: t.kinds.line,
    priority: 50,
    matches: (o) => typeOf(o) === 'doryline' || typeOf(o) === 'line',
  })

  registerObjectKind({
    id: 'shape',
    label: t.kinds.shape,
    priority: 40,
    matches: (o) => SHAPE_TYPES.has(typeOf(o)),
    hydrate(obj) {
      const effects = asDory(obj).effects
      if (effects) applyEffects(obj, effects)
    },
  })

  registerObjectKind({
    id: 'group',
    label: t.kinds.group,
    priority: 30,
    matches: (o) => typeOf(o) === 'group' || typeOf(o) === 'activeselection',
  })
}

registerBuiltinKinds()
