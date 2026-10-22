/**
 * Draws the frames of a video, one after another. A frame is either a page at a moment of its clock or two pages in
 * the middle of a transition, and it is always the size of the video: a page of another shape is fitted or filled into
 * it (`placePage`), with bars in the page's own colour.
 *
 * Pages are drawn by the shared frame renderer (`animation/frameRenderer`), the same that the editor preview and the
 * slideshow use, one page at a time: the renderer of a page is made when the video reaches it and disposed when the
 * video leaves, so memory holds the bitmaps of one page and three frame-sized canvases whatever the length of the video.
 * The page that is left stands as it rested during the transition into the next, which is how the slideshow shows it.
 */
import type { DocPage } from '@/types/document'
import type { ClipMediaFactory } from '../../../animation/clipSource'
import { type FrameRenderer, createFrameRenderer } from '../../../animation/frameRenderer'
import { sampleTransition } from '../../../animation/sampler'
import { drawTransition } from '../../../animation/transitionRenderer'
import { type ClipLook, drawWithLook } from '../../../clips/look'
import { parseColor } from '../../colors'
import type { LoadContext } from '../../serialization'
import { type Rect, type Size, barColour, coversFrame, placePage } from './geometry'
import type { FitMode } from './options'
import type { FramePlan } from './schedule'
import type { Segment } from './timeline'

export interface ComposerOptions {
  frame: Size
  fit: FitMode
  loadContext: LoadContext
  /** The frames are read back as pixels (a GIF): always draw into the frame's own canvas, with a context made for reading. */
  readback: boolean
  /** Where video clips get their pictures (each frame waits for the exact one); without it clips show their poster. */
  media?: ClipMediaFactory
}

interface Entered {
  segment: Segment
  renderer: FrameRenderer
  place: Rect
  bars: string
  /** The page's shape is the frame's: it takes the whole frame. */
  covers: boolean
  /** ...and it is opaque, so its bitmap can go to the encoder as it is. */
  direct: boolean
}

function makeCanvas(size: Size): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  return canvas
}

function context(canvas: HTMLCanvasElement, readback: boolean): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', readback ? { willReadFrequently: true } : undefined)
  if (!ctx) throw new Error('This browser cannot draw on a canvas.')
  return ctx
}

/** True when every pixel of the page is opaque: a solid or gradient background with no transparency in it. */
export function isOpaquePage(page: Pick<DocPage, 'background'>): boolean {
  const background = page.background
  if (background.type === 'solid') return parseColor(background.color)?.a === 1
  if (background.type === 'gradient') return background.stops.length > 0 && background.stops.every((s) => parseColor(s.color)?.a === 1)
  return false
}

/** The bars of `blur` fitting: the page scaled to cover the frame, strongly blurred and a little darker. */
const BAR_LOOK: ClipLook = { css: 'brightness(0.85)', blur: 0.06, vignette: 0 }

export class FrameComposer {
  private readonly out: HTMLCanvasElement
  private readonly outContext: CanvasRenderingContext2D
  private from: HTMLCanvasElement | null = null
  private to: HTMLCanvasElement | null = null
  private entered: Entered | null = null
  private disposed = false

  constructor(private readonly options: ComposerOptions) {
    this.out = makeCanvas(options.frame)
    this.outContext = context(this.out, options.readback)
  }

  /** The pixels of the last frame drawn (only when the composer was made for reading back). */
  pixels(): ImageData {
    return this.outContext.getImageData(0, 0, this.out.width, this.out.height)
  }

  /** Draws the frame `plan` asks for and returns the bitmap that holds it; valid until the next call. */
  async draw(plan: FramePlan): Promise<HTMLCanvasElement> {
    const entered = await this.enter(plan.segment)
    if (plan.kind === 'transition') return this.drawTransition(entered, plan.progress)
    await entered.renderer.prepare(plan.pageMs)
    const bitmap = entered.renderer.render(plan.pageMs)
    if (entered.direct && !this.options.readback && bitmap.width === this.out.width && bitmap.height === this.out.height) return bitmap
    this.place(this.outContext, bitmap, entered)
    return this.out
  }

  /** Puts a page bitmap on `ctx` over its bars, covering the whole frame. */
  private place(ctx: CanvasRenderingContext2D, bitmap: HTMLCanvasElement, entered: Entered): void {
    const { frame } = this.options
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = entered.bars
    ctx.fillRect(0, 0, frame.width, frame.height)
    if (this.options.fit === 'blur' && !entered.covers) {
      const cover = Math.max(frame.width / bitmap.width, frame.height / bitmap.height)
      const w = bitmap.width * cover
      const h = bitmap.height * cover
      drawWithLook(ctx, bitmap, (frame.width - w) / 2, (frame.height - h) / 2, w, h, BAR_LOOK)
    }
    if (entered.covers) ctx.drawImage(bitmap, 0, 0, frame.width, frame.height)
    // Whole pixels: a bitmap drawn half a pixel off is blurred by the browser.
    else ctx.drawImage(bitmap, Math.round((frame.width - bitmap.width) / 2), Math.round((frame.height - bitmap.height) / 2))
    ctx.restore()
  }

  private stage(): HTMLCanvasElement {
    return makeCanvas(this.options.frame)
  }

  private drawTransition(entered: Entered, progress: number): HTMLCanvasElement {
    const transition = entered.segment.transition
    if (!transition || !this.from || !this.to) {
      this.place(this.outContext, entered.renderer.render(0), entered)
      return this.out
    }
    drawTransition(this.outContext, sampleTransition(transition, Math.min(1, Math.max(0, progress))), this.from, this.to, this.out.width, this.out.height)
    return this.out
  }

  /** Makes the renderer of a segment's page the current one, leaving the page before it. */
  private async enter(segment: Segment): Promise<Entered> {
    if (this.entered?.segment === segment) return this.entered
    const previous = this.entered
    if (previous && segment.transition) {
      // The page that is left, as it rests at the end of its time.
      this.from ??= this.stage()
      await previous.renderer.prepare(previous.segment.bodyMs)
      this.place(context(this.from, false), previous.renderer.render(previous.segment.bodyMs), previous)
    }
    if (previous) previous.renderer.dispose()
    this.entered = null
    const { frame, fit } = this.options
    const { rect, scale } = placePage(segment.size, frame, fit)
    const renderer = await createFrameRenderer(segment.page, segment.size, this.options.loadContext, { multiplier: scale, media: this.options.media })
    if (this.disposed) {
      renderer.dispose()
      throw new DOMException('Export cancelled', 'AbortError')
    }
    const covers = coversFrame(rect, frame)
    const entered: Entered = { segment, renderer, place: rect, bars: barColour(segment.page), covers, direct: covers && isOpaquePage(segment.page) }
    this.entered = entered
    if (segment.transition) {
      this.to ??= this.stage()
      // Clips are still during the transition into their page (as everything else on it is): its first picture.
      await renderer.prepare(0)
      this.place(context(this.to, false), renderer.render(0), entered)
    } else {
      // No transition into this page: nothing needs holding for one.
      this.from = this.release(this.from)
      this.to = this.release(this.to)
    }
    return entered
  }

  private release(canvas: HTMLCanvasElement | null): null {
    if (canvas) {
      canvas.width = 1
      canvas.height = 1
    }
    return null
  }

  dispose(): void {
    this.disposed = true
    this.entered?.renderer.dispose()
    this.entered = null
    this.from = this.release(this.from)
    this.to = this.release(this.to)
    this.out.width = 1
    this.out.height = 1
  }
}
