import { deflateSync } from 'node:zlib'
import { type Page, expect } from '@playwright/test'

export interface DocObjectLike {
  id: string
  type: string
  [k: string]: unknown
}

export async function openEditor(page: Page, query = ''): Promise<void> {
  await page.goto(`/editor-harness.html${query ? `?${query}` : ''}`)
  await page.waitForSelector('[data-editor-root]')
  await page.waitForFunction(() => !!window.__doory)
  // First page canvas is mounted and loaded.
  await page.waitForSelector('[data-artboard] .doory-canvas', { timeout: 20_000 })
}

export async function getDoc(page: Page): Promise<{ width: number; height: number; pages: { id: string; name?: string; objects: DocObjectLike[]; background: Record<string, unknown> }[] }> {
  return page.evaluate(() => window.__doory!.getDocument() as never)
}

export async function pageObjects(page: Page, index = 0): Promise<DocObjectLike[]> {
  return (await getDoc(page)).pages[index].objects
}

export async function waitForObjectCount(page: Page, count: number, index = 0): Promise<void> {
  await expect.poll(async () => (await pageObjects(page, index)).length, { timeout: 10_000 }).toBe(count)
}

/** Client coordinates of a point given in page pixels on the n-th page. */
export async function toClient(page: Page, x: number, y: number, index = 0): Promise<{ x: number; y: number }> {
  const doc = await getDoc(page)
  const box = await page.locator('[data-artboard]').nth(index).boundingBox()
  if (!box) throw new Error('artboard not found')
  const zoom = box.width / doc.width
  return { x: box.x + x * zoom, y: box.y + y * zoom }
}

export async function click(page: Page, x: number, y: number, index = 0): Promise<void> {
  const p = await toClient(page, x, y, index)
  await page.mouse.click(p.x, p.y)
}

export async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, index = 0, steps = 12): Promise<void> {
  const a = await toClient(page, from.x, from.y, index)
  const b = await toClient(page, to.x, to.y, index)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move(b.x, b.y, { steps })
  await page.mouse.up()
}

/** Tools of the top bar (data-testid `ed-add-entry-<id>`), by the id the registry gives them. */
export type ToolId = 'templates' | 'text' | 'elements' | 'image' | 'shapes' | 'background' | 'brand' | 'layers' | 'animate'

/** Opens a tool of the top bar (a drawer under its button or a docked sidebar) unless it is already open. */
export async function openTool(page: Page, id: ToolId): Promise<void> {
  const btn = page.locator(`[data-testid="ed-add-entry-${id}"]`)
  if ((await btn.getAttribute('aria-pressed')) !== 'true') await btn.click()
}

export type ShapeId = 'rect' | 'ellipse' | 'triangle' | 'line' | 'star' | 'diamond' | 'divider' | 'frame' | 'rounded' | 'polygon' | 'arrow' | 'qr' | 'placeholder' | 'path-heart' | 'path-speech'

/** Adds a shape from the Shapes drawer (the drawer closes after the click). */
export async function addShape(page: Page, id: ShapeId): Promise<void> {
  await openTool(page, 'shapes')
  await page.locator(`[data-testid="shape-${id}"]`).click()
}

/** Adds `n` objects of one shape kind. */
export async function addShapes(page: Page, id: ShapeId, n: number): Promise<void> {
  for (let i = 0; i < n; i++) await addShape(page, id)
}

/** Adds a text preset from the Text drawer; the new text starts selected in edit mode. */
export async function addText(page: Page, preset: 'heading' | 'subheading' | 'body' = 'heading'): Promise<void> {
  await openTool(page, 'text')
  await page.locator(`[data-testid="text-preset-${preset}"]`).click()
}

/** The contextual toolbar under the top bar (morphs with the selection). */
export const toolbarOf = (page: Page) => page.getByRole('toolbar', { name: 'Formatting' })

/** Opens the full Download dialog from the Share menu. */
export async function openDownloadDialog(page: Page): Promise<void> {
  await page.locator('[data-testid="ed-share"]').click()
  await page.getByRole('menuitem', { name: 'All formats and options…' }).click()
}

/** Clicks an item of the "More" menu in the top bar. */
export async function moreMenu(page: Page, name: string | RegExp): Promise<void> {
  await page.locator('[data-testid="ed-more"]').click()
  await page.getByRole('menuitem', { name }).or(page.getByRole('menuitemcheckbox', { name })).click()
}

/** Pixel probe on the overlay canvas of the first live page: any non-transparent pixel? */
export async function overlayHasInk(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const wrapper = document.querySelector('.doory-canvas')
    const overlay = wrapper?.querySelector<HTMLCanvasElement>('canvas[aria-hidden="true"]:last-child')
    const ctx = overlay?.getContext('2d')
    if (!overlay || !ctx) return false
    const data = ctx.getImageData(0, 0, overlay.width, overlay.height).data
    for (let i = 3; i < data.length; i += 4) if (data[i] > 20) return true
    return false
  })
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const out = Buffer.alloc(body.length + 8)
  out.writeUInt32BE(data.length, 0)
  body.copy(out, 4)
  out.writeUInt32BE(crc32(body), body.length + 4)
  return out
}

/** A valid solid-colour RGB PNG for upload tests. */
export function pngBuffer(width = 120, height = 80, rgb: readonly [number, number, number] = [225, 29, 72]): Buffer {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 2, 0, 0, 0], 8)
  const row = Buffer.alloc(1 + width * 3)
  for (let x = 0; x < width; x++) row.set(rgb, 1 + x * 3)
  const raw = Buffer.concat(Array.from({ length: height }, () => row))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}
