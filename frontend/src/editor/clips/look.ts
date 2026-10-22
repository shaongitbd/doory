/**
 * The adjustments of a picture (`filterSpecs`, see `engine/objects/filters.ts`) as a canvas filter, for what changes
 * every frame: a video clip's pictures, and the blurred bars of the video export. Fabric's own filters stay on the
 * stills (canvas, thumbnails, downloads); this draws the same look, close enough to read as one, at a cost the
 * browser pays on the GPU.
 *
 * A strong blur is drawn on a small bitmap and scaled up (it is blurred anyway), and with the picture stretched a
 * little past the edges, so the edges keep their colour instead of fading into nothing.
 */
import type { ImageFilterSpec } from '@/types/document'

export interface ClipLook {
  /** `ctx.filter` without the blur. */
  css: string
  /** Blur (a Gaussian's deviation) as a share of the picture's shorter side (0: none). */
  blur: number
  /** 0..1 */
  vignette: number
}

const NONE: ClipLook = { css: 'none', blur: 0, vignette: 0 }
/**
 * Fabric blurs with a triangle that reaches `value * 0.25 * 0.12` of the picture's shorter side each way; a Gaussian
 * with the same spread (its deviation is the reach / sqrt(6)) looks the same.
 */
const BLUR_SHARE = (0.25 * 0.12) / Math.sqrt(6)
/** A blur is drawn this many times smaller than its radius in pixels (at least 1:1, at most 1:8). */
const BLUR_DOWNSCALE_PX = 6

export function lookOf(specs: readonly ImageFilterSpec[] | undefined): ClipLook {
  if (!specs || specs.length === 0) return NONE
  const parts: string[] = []
  let blur = 0
  let vignette = 0
  for (const { type, value } of specs) {
    switch (type) {
      case 'brightness':
        if (value) parts.push(`brightness(${(1 + value).toFixed(3)})`)
        break
      case 'contrast':
        if (value) parts.push(`contrast(${(1 + value).toFixed(3)})`)
        break
      case 'saturation':
        if (value) parts.push(`saturate(${Math.max(0, 1 + value).toFixed(3)})`)
        break
      case 'hue':
        if (value) parts.push(`hue-rotate(${Math.round(value * 180)}deg)`)
        break
      case 'grayscale':
        if (value > 0) parts.push('grayscale(1)')
        break
      case 'sepia':
        if (value > 0) parts.push('sepia(1)')
        break
      case 'blur':
        blur = Math.max(0, value) * BLUR_SHARE
        break
      case 'vignette':
        vignette = Math.max(0, Math.min(1, value))
        break
    }
  }
  return { css: parts.length > 0 ? parts.join(' ') : 'none', blur, vignette }
}

export function isPlainLook(look: ClipLook): boolean {
  return look.css === 'none' && look.blur === 0 && look.vignette === 0
}

let scratch: HTMLCanvasElement | null = null

function scratchCanvas(width: number, height: number): CanvasRenderingContext2D | null {
  scratch ??= document.createElement('canvas')
  if (scratch.width !== width || scratch.height !== height) {
    scratch.width = width
    scratch.height = height
  }
  return scratch.getContext('2d')
}

/** Draws `picture` over the whole of `w` x `h` at (x, y) on `ctx`, with `look`. */
export function drawWithLook(ctx: CanvasRenderingContext2D, picture: CanvasImageSource, x: number, y: number, w: number, h: number, look: ClipLook): void {
  if (isPlainLook(look)) {
    ctx.drawImage(picture, x, y, w, h)
    return
  }
  const radius = look.blur * Math.min(w, h)
  if (radius >= 1) {
    const scale = Math.min(1, Math.max(1 / 8, BLUR_DOWNSCALE_PX / radius))
    const sw = Math.max(1, Math.round(w * scale))
    const sh = Math.max(1, Math.round(h * scale))
    const small = scratchCanvas(sw, sh)
    if (small) {
      const r = radius * scale
      small.save()
      small.clearRect(0, 0, sw, sh)
      small.filter = `${look.css === 'none' ? '' : `${look.css} `}blur(${r.toFixed(2)}px)`
      // Stretched past the edges by the blur's reach, so the blur has picture to take from there.
      small.drawImage(picture, -2 * r, -2 * r, sw + 4 * r, sh + 4 * r)
      small.restore()
      ctx.save()
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(small.canvas, 0, 0, sw, sh, x, y, w, h)
      ctx.restore()
      vignetteOver(ctx, x, y, w, h, look.vignette)
      return
    }
  }
  ctx.save()
  ctx.filter = look.css
  ctx.drawImage(picture, x, y, w, h)
  ctx.restore()
  vignetteOver(ctx, x, y, w, h, look.vignette)
}

/** Darkens the corners like Fabric's vignette: nothing inside 35 % of the half diagonal, `amount` at the corners. */
function vignetteOver(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, amount: number): void {
  if (amount <= 0) return
  const cx = x + w / 2
  const cy = y + h / 2
  const reach = Math.hypot(w, h) / 2
  const gradient = ctx.createRadialGradient(cx, cy, reach * 0.35, cx, cy, reach * 1.05)
  gradient.addColorStop(0, 'rgba(0,0,0,0)')
  gradient.addColorStop(0.5, `rgba(0,0,0,${(amount * 0.5).toFixed(3)})`)
  gradient.addColorStop(1, `rgba(0,0,0,${amount.toFixed(3)})`)
  ctx.save()
  ctx.globalCompositeOperation = 'source-atop'
  ctx.fillStyle = gradient
  ctx.fillRect(x, y, w, h)
  ctx.restore()
}
