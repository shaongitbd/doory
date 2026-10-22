/**
 * Off-screen page rendering (snapshots, thumbnails, exports). Pages are rendered from their document
 * JSON on a `StaticCanvas`, never from the live editing canvases, so selection handles, guides and rulers
 * can never leak into the output.
 */
import { type FabricObject, Group, Pattern, Rect, StaticCanvas } from 'fabric'
import type { DocObject, DocPage } from '@/types/document'
import { safeLinkUrl } from './api/style'
import { installBackground, buildBackground } from './objects/background'
import { asDory } from './objects/dory'
import { embedImages } from './export/svgEmbed'
import { type LoadContext, deserializeObjects } from './serialization'

export interface RenderOptions {
  /** Output pixels per page pixel. */
  multiplier: number
  /** Skip the page background (PNG with transparent background). */
  transparent?: boolean
  /** Print bleed in px: the picture also shows this much around the page (see `PageSvgOptions.bleed`). */
  bleed?: number
}

export interface PageSvgOptions {
  /**
   * Print bleed in px. The SVG's `viewBox` becomes the page grown by the bleed on every side (`-b -b w+2b h+2b`):
   * the layout stays 1:1, objects hanging over the page edge continue into the bleed, and the page background is
   * built for the larger box (a gradient or picture is stretched by the bleed, never left white).
   */
  bleed?: number
  /** Wrap objects that have a hyperlink in `<a href>` (http and https addresses only). */
  links?: boolean
  /** Without the XML declaration and DOCTYPE: what the print server's sanitiser (no DTDs) accepts. */
  bare?: boolean
}

export const MAX_CANVAS_PIXELS = 100_000_000
export const MAX_CANVAS_SIDE = 16_384

/** Largest multiplier <= `wanted` that keeps the bitmap within browser canvas limits. */
export function safeMultiplier(width: number, height: number, wanted: number): number {
  const bySide = MAX_CANVAS_SIDE / Math.max(width, height)
  const byArea = Math.sqrt(MAX_CANVAS_PIXELS / (width * height))
  return Math.max(0.05, Math.min(wanted, bySide, byArea))
}

/** Unfilled placeholders are editing aids: they never appear in output. */
export function renderableObjects(objects: readonly DocObject[]): DocObject[] {
  return objects.filter((o) => !(o.isPlaceholder === true && o.type !== 'image') && o.visible !== false)
}

/**
 * What a still of the page shows: the page as it starts. The later parts of a split video clip only come in when it is
 * their turn, so they are left out (the part before them shows).
 */
export function stillObjects(objects: readonly DocObject[]): DocObject[] {
  return renderableObjects(objects).filter((o) => o.videoHideBefore !== true)
}

/**
 * A canvas that draws a page. With a `bleed` the canvas is the page grown by the bleed on every side; the page keeps its
 * coordinates, so the bleed lies at negative ones and callers show it with a viewBox (SVG) or `left`/`top` (bitmap).
 */
async function buildStaticCanvas(
  page: DocPage,
  width: number,
  height: number,
  ctx: LoadContext,
  transparent: boolean,
  bleed = 0,
): Promise<StaticCanvas> {
  const frameWidth = width + 2 * bleed
  const frameHeight = height + 2 * bleed
  const canvas = new StaticCanvas(document.createElement('canvas'), {
    width: frameWidth,
    height: frameHeight,
    renderOnAddRemove: false,
    enableRetinaScaling: false,
    skipOffscreen: false,
  })
  const [objects, background] = await Promise.all([
    deserializeObjects(stillObjects(page.objects), ctx),
    transparent ? Promise.resolve(null) : buildBackground(page.background, frameWidth, frameHeight, (s) => ctx.resolveSrc(s)),
  ])
  installBackground(canvas, background, frameWidth, frameHeight)
  // Fabric counts a shape's default 1 px stroke width in its size even without a stroke, which would leave the first
  // row and column of the page half covered: the background and the clip are exactly as large as the frame.
  if (background) {
    background.object.set({ strokeWidth: 0, left: (background.object.left ?? 0) - bleed, top: (background.object.top ?? 0) - bleed })
    const fill = background.object.fill
    // A tiled picture keeps its phase relative to the page, not to the larger box.
    if (fill instanceof Pattern) {
      fill.offsetX = bleed
      fill.offsetY = bleed
    }
  }
  canvas.clipPath = new Rect({ originX: 'left', originY: 'top', left: -bleed, top: -bleed, width: frameWidth, height: frameHeight, strokeWidth: 0, absolutePositioned: true, excludeFromExport: true })
  canvas.add(...objects)
  canvas.renderAll()
  return canvas
}

const escapeAttr = (value: string): string => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Makes every object with a hyperlink write itself as `<a data-link="n">…</a>` and returns the addresses by `n`. The
 * addresses are put in after the images were embedded (`embedImages` fetches every `href` it sees).
 */
function markLinks(objects: readonly FabricObject[], urls: string[]): void {
  for (const object of objects) {
    const url = safeLinkUrl(asDory(object).link?.url ?? '')
    if (url !== null) {
      const index = urls.push(url) - 1
      const toSVG = object.toSVG.bind(object)
      object.toSVG = (reviver) => `<a data-link="${index}">${toSVG(reviver)}</a>`
    }
    if (object instanceof Group) markLinks(object.getObjects(), urls)
  }
}

function writeLinks(svg: string, urls: readonly string[]): string {
  return svg.replace(/<a data-link="(\d+)">/g, (_whole, index: string) => `<a href="${escapeAttr(urls[Number(index)] ?? '')}">`)
}

/** Rasterises a page. Resolves with a canvas of `width*multiplier` x `height*multiplier` pixels. */
export async function renderPageToCanvas(
  page: DocPage,
  size: { width: number; height: number },
  ctx: LoadContext,
  options: RenderOptions,
): Promise<HTMLCanvasElement> {
  const bleed = options.bleed ?? 0
  const canvas = await buildStaticCanvas(page, size.width, size.height, ctx, options.transparent === true, bleed)
  try {
    const frame = { width: size.width + 2 * bleed, height: size.height + 2 * bleed }
    const m = safeMultiplier(frame.width, frame.height, options.multiplier)
    return canvas.toCanvasElement(m, { left: -bleed, top: -bleed, ...frame })
  } finally {
    canvas.dispose()
  }
}

/**
 * SVG markup of a page (SVG download and the server-side PDF path). Images are always embedded as data URIs
 * so the file is self-contained and survives the server's href sanitiser.
 */
export async function renderPageToSvg(page: DocPage, size: { width: number; height: number }, ctx: LoadContext, options: PageSvgOptions = {}): Promise<string> {
  const bleed = options.bleed ?? 0
  const canvas = await buildStaticCanvas(page, size.width, size.height, ctx, false, bleed)
  const links: string[] = []
  let svg: string
  try {
    if (options.links) markLinks(canvas.getObjects(), links)
    const frame = { width: size.width + 2 * bleed, height: size.height + 2 * bleed }
    svg = canvas.toSVG({ width: `${frame.width}`, height: `${frame.height}`, viewBox: { x: -bleed, y: -bleed, ...frame }, suppressPreamble: options.bare === true })
  } finally {
    canvas.dispose()
  }
  return writeLinks(await embedImages(svg), links)
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('The browser could not encode the image.'))),
      type,
      quality,
    )
  })
}
