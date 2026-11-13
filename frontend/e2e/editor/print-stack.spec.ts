/**
 * Print-quality PDF through the real stack: the editor in the browser, the Django API and its headless Chromium print
 * worker. Run with `npm run e2e:print` (playwright.print.config.ts); the downloaded file is read with pypdf.
 *
 *   PRINT_SHOTS=<folder>   also saves screenshots of the dialog (light and dark) and a picture of a printed page there
 */
import { type Page, expect, test } from '@playwright/test'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Account, createAccounts, createDesign, open } from '../collab/helpers'
import { pngBuffer } from './helpers'

const here = dirname(fileURLToPath(import.meta.url))
const backend = resolve(here, '../../../backend')
const venv = join(backend, '.venv/bin/python')
const python = process.env.DOORY_PYTHON ?? (existsSync(venv) ? venv : 'python3')
const shots = process.env.PRINT_SHOTS ?? ''

const PX_PER_MM = 96 / 25.4
const PT_PER_PX = 0.75

interface PdfFacts {
  title: string | null
  lang: string | null
  creator: string | null
  pages: { media: number[]; trim: number[] | null; bleed: number[] | null; text: string; images: number; links: { uri: string; rect: number[] }[] }[]
}

const READER = `
import io, json, sys
import pypdf
reader = pypdf.PdfReader(io.BytesIO(sys.stdin.buffer.read()))
def rect(page, key):
    return [float(v) for v in page[key]] if key in page else None
pages = []
for page in reader.pages:
    links = []
    for annotation in page.get("/Annots", []):
        annotation = annotation.get_object()
        if annotation.get("/Subtype") == "/Link" and "/A" in annotation:
            links.append({"uri": str(annotation["/A"].get("/URI")), "rect": [float(v) for v in annotation["/Rect"]]})
    pages.append({"media": rect(page, "/MediaBox"), "trim": rect(page, "/TrimBox"), "bleed": rect(page, "/BleedBox"), "text": page.extract_text(), "images": len(page.images), "links": links})
meta = reader.metadata
print(json.dumps({"title": meta.title if meta else None, "creator": meta.creator if meta else None, "lang": str(reader.trailer["/Root"].get("/Lang")), "pages": pages}))
`

/** What the PDF says about itself: page boxes, links, title and language (read with pypdf from the backend's interpreter). */
function readPdf(bytes: Buffer): PdfFacts {
  return JSON.parse(execFileSync(python, ['-I', '-c', READER], { input: bytes, maxBuffer: 64 * 1024 * 1024 }).toString()) as PdfFacts
}

const SIZES = [
  { width: 1080, height: 1080 },
  { width: 794, height: 1123 },
  { width: 400, height: 300 },
]

/** Three pages of different sizes: a square post with a link, an A4 page, a small card. */
function mixedDocument() {
  const shape = (id: string, extra: Record<string, unknown>) => ({ id, type: 'rect', width: 200, height: 120, scaleX: 1, scaleY: 1, angle: 0, originX: 'center', originY: 'center', ...extra })
  return {
    schemaVersion: 1,
    width: SIZES[0].width,
    height: SIZES[0].height,
    unit: 'px',
    pages: [
      {
        id: 'post',
        background: { type: 'solid', color: '#fde68a' },
        objects: [
          shape('a', { left: 300, top: 300, fill: '#e11d48' }),
          shape('offer', { left: 700, top: 700, width: 300, height: 140, fill: '#2563eb', link: { url: 'https://example.com/offer?utm=print' } }),
          { id: 't', type: 'textbox', left: 540, top: 120, width: 700, height: 80, text: 'Summer sale', fontSize: 72, fontFamily: 'Inter, sans-serif', fontWeight: 700, fill: '#1c1517', textAlign: 'center', originX: 'center', originY: 'center', scaleX: 1, scaleY: 1, angle: 0 },
        ],
      },
      { id: 'flyer', width: SIZES[1].width, height: SIZES[1].height, background: { type: 'solid', color: '#bbf7d0' }, objects: [shape('b', { left: 400, top: 560, fill: '#15803d' })] },
      { id: 'card', width: SIZES[2].width, height: SIZES[2].height, background: { type: 'solid', color: '#bfdbfe' }, objects: [shape('c', { left: 200, top: 150, fill: '#1d4ed8', width: 100, height: 60 })] },
    ],
  }
}

let account: Account

test.beforeAll(async ({ browser }) => {
  account = (await createAccounts(browser, ['Pia']))['Pia']
})

async function openDesign(browser: Parameters<typeof open>[0], theme: 'light' | 'dark' = 'light', viewport?: { width: number; height: number }) {
  const owner = await open(browser, account, '/dashboard')
  const id = await createDesign(owner, mixedDocument() as never, 'Menu card')
  await owner.context.close()
  const client = await open(browser, account, `/design/${id}`, { theme, viewport })
  await client.page.waitForSelector('[data-editor-root]')
  await client.page.waitForSelector('[data-artboard] .doory-canvas', { timeout: 30_000 })
  return { ...client, id }
}

async function openDialog(page: Page) {
  await page.keyboard.press('Control+Shift+D')
  const dialog = page.getByRole('dialog', { name: 'Download' })
  await expect(dialog).toBeVisible()
  return dialog
}

/** Five A5 pages with text, vector graphics and a saved image layer on every page. */
function graphicBooklet() {
  const picture = `data:image/png;base64,${pngBuffer(320, 240, [30, 120, 200]).toString('base64')}`
  const colors = ['#e11d48', '#2563eb', '#15803d', '#9333ea', '#ea580c']
  return {
    schemaVersion: 1,
    width: 559,
    height: 794,
    unit: 'px',
    pages: colors.map((color, index) => ({
      id: `leaf-${index + 1}`,
      background: { type: 'solid', color: '#fffaf0' },
      objects: [
        { id: `title-${index}`, type: 'textbox', left: 280, top: 72, width: 460, height: 66, text: `Leaf ${index + 1}`, fontSize: 48, fontFamily: 'Arial', fill: '#1c1517', textAlign: 'center', originX: 'center', originY: 'center', scaleX: 1, scaleY: 1, angle: 0 },
        { id: `picture-${index}`, type: 'image', src: picture, left: 280, top: 320, width: 320, height: 240, originX: 'center', originY: 'center', scaleX: 1, scaleY: 1, angle: 0 },
        ...Array.from({ length: 12 }, (_, item) => ({ id: `graphic-${index}-${item}`, type: 'rect', left: 75 + (item % 4) * 135, top: 540 + Math.floor(item / 4) * 68, width: 90, height: 42, fill: color, originX: 'center', originY: 'center', scaleX: 1, scaleY: 1, angle: 0 })),
      ],
    })),
  }
}

test('a graphic-heavy A5 booklet exports through the print server at desktop, tablet and mobile sizes', async ({ browser }) => {
  const owner = await open(browser, account, '/dashboard')
  const id = await createDesign(owner, graphicBooklet() as never, 'Five-page booklet')
  await owner.context.close()

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 820, height: 1180 },
    { width: 390, height: 844 },
    { width: 320, height: 568 },
  ]) {
    const { page, context } = await open(browser, account, `/design/${id}`, { viewport })
    await page.waitForSelector('[data-artboard] .doory-canvas', { timeout: 30_000 })
    const dialog = await openDialog(page)
    await dialog.getByRole('radio', { name: /Print-quality PDF/ }).check()
    await dialog.getByRole('radio', { name: 'Booklet' }).check()
    await expect(dialog.getByTestId('fold-preview')).toContainText('3 blanks')
    await expect(dialog.getByLabel('PDF sheet sides')).toBeVisible()
    expect(await dialog.evaluate((element) => element.scrollWidth > element.clientWidth + 1)).toBe(false)
    const bounds = await dialog.boundingBox()
    expect(bounds).not.toBeNull()
    expect(bounds!.x).toBeGreaterThanOrEqual(0)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width + 1)
    if (shots) {
      mkdirSync(shots, { recursive: true })
      await page.screenshot({ path: join(shots, `booklet-dialog-${viewport.width}.png`) })
    }

    if (viewport.width === 820) {
      await dialog.getByRole('radio', { name: 'Book signatures' }).check()
      await dialog.getByLabel('Binding edge').selectOption('right')
      await dialog.getByLabel('Pages per signature').selectOption('4')
      await expect(dialog.getByTestId('fold-preview')).toContainText('Sheet 1, front: Page 1 | Page 4')
    }
    if (viewport.width === 390) await dialog.getByLabel('PDF sheet sides').selectOption('back')

    const pending = page.waitForEvent('download', { timeout: 120_000 })
    await dialog.getByRole('button', { name: 'Download', exact: true }).click()
    const file = await pending
    const bytes = readFileSync((await file.path()) as string)
    const pdf = readPdf(bytes)
    expect(pdf.pages).toHaveLength(viewport.width === 390 ? 2 : 4)
    for (const side of pdf.pages) {
      expect(side.media[2] - side.media[0]).toBeCloseTo(297 * PX_PER_MM * PT_PER_PX, 1)
      expect(side.media[3] - side.media[1]).toBeCloseTo(210 * PX_PER_MM * PT_PER_PX, 1)
    }
    if (viewport.width === 1440) {
      expect(pdf.pages[0].text).toContain('Leaf 1')
      expect(pdf.pages[3].text).toContain('Leaf 5')
      expect(pdf.pages[0].images).toBeGreaterThan(0)
    }
    if (shots) writeFileSync(join(shots, `booklet-${viewport.width}.pdf`), bytes)
    await context.close()
  }
})

test('the saved-design PDF API prints right-bound book fronts from the same illustrated pages', async ({ browser }) => {
  const owner = await open(browser, account, '/dashboard')
  const id = await createDesign(owner, graphicBooklet() as never, 'API book')
  const csrf = (await owner.context.cookies()).find((cookie) => cookie.name === 'csrftoken')?.value ?? ''
  const response = await owner.context.request.post(`/api/v1/designs/${id}/export/image/`, {
    data: { format: 'pdf', pages: 'all', layout: 'book', signature_pages: 4, binding: 'right', print_sides: 'front' },
    headers: { 'X-CSRFToken': csrf },
    timeout: 120_000,
  })
  expect(response.status(), await response.text()).toBe(200)
  const pdf = readPdf(Buffer.from(await response.body()))
  expect(pdf.pages).toHaveLength(2)
  expect(pdf.pages[0].media[2] - pdf.pages[0].media[0]).toBeCloseTo(297 * PX_PER_MM * PT_PER_PX, 1)
  expect(pdf.pages[0].images).toBeGreaterThan(0)
  await owner.context.close()
})

test('a design of three sizes prints with bleed and crop marks: every page has its own boxes, the link works', async ({ browser }) => {
  const { page, context } = await openDesign(browser)
  const dialog = await openDialog(page)
  await dialog.getByRole('radio', { name: /Print-quality PDF/ }).check()
  await dialog.getByRole('radio', { name: /Standard print/ }).check()
  await expect(dialog.getByTestId('print-summary')).toHaveText('3 pages · 3 sizes: 1080×1080, A4, 400×300')

  const pending = page.waitForEvent('download', { timeout: 120_000 })
  await dialog.getByRole('button', { name: 'Download', exact: true }).click()
  const file = await pending
  expect(file.suggestedFilename()).toBe('Menu-card-print.pdf')
  const bytes = readFileSync((await file.path()) as string)
  expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-')

  const pdf = readPdf(bytes)
  expect(pdf.title).toBe('Menu card')
  expect(pdf.creator).toBe('Doory')
  expect(pdf.lang).toBe('en')
  expect(pdf.pages).toHaveLength(3)
  const bleed = 3 * PX_PER_MM
  const slug = 6 * PX_PER_MM
  pdf.pages.forEach((p, i) => {
    const { width, height } = SIZES[i]
    const [mx0, my0, mx1, my1] = p.media
    const [bx0, by0, bx1, by1] = p.bleed ?? []
    const [tx0, ty0, tx1, ty1] = p.trim ?? []
    // media = trim + 2 x (bleed + slug), bleed box = trim + 2 x bleed, trim = the design's own size
    expect(mx1 - mx0).toBeCloseTo((width + 2 * (bleed + slug)) * PT_PER_PX, 1)
    expect(my1 - my0).toBeCloseTo((height + 2 * (bleed + slug)) * PT_PER_PX, 1)
    expect(bx1 - bx0).toBeCloseTo((width + 2 * bleed) * PT_PER_PX, 1)
    expect(by1 - by0).toBeCloseTo((height + 2 * bleed) * PT_PER_PX, 1)
    expect(tx1 - tx0).toBeCloseTo(width * PT_PER_PX, 1)
    expect(ty1 - ty0).toBeCloseTo(height * PT_PER_PX, 1)
    expect(bx0 - mx0).toBeCloseTo(slug * PT_PER_PX, 1)
    expect(tx0 - bx0).toBeCloseTo(bleed * PT_PER_PX, 1)
    expect(my1 - by1).toBeCloseTo(slug * PT_PER_PX, 1)
    expect(by1 - ty1).toBeCloseTo(bleed * PT_PER_PX, 1)
  })
  // text stays text; the object with a link is a link annotation inside the trim box of the first page
  expect(pdf.pages[0].text).toContain('Summer sale')
  expect(pdf.pages[0].links.map((l) => l.uri)).toEqual(['https://example.com/offer?utm=print'])
  const [lx0, ly0, lx1, ly1] = pdf.pages[0].links[0].rect
  const [tx0, , , ty1] = pdf.pages[0].trim ?? []
  expect(lx0 - tx0).toBeCloseTo((700 - 150) * PT_PER_PX, 0) // the link box starts 550 px into the page
  expect(lx1 - lx0).toBeCloseTo(300 * PT_PER_PX, 0)
  expect(ty1 - ly1).toBeCloseTo((700 - 70) * PT_PER_PX, 0) // and 630 px below its top edge
  expect(ly1 - ly0).toBeCloseTo(140 * PT_PER_PX, 0)
  expect(pdf.pages[1].links).toEqual([])
  expect(pdf.pages[2].links).toEqual([])

  if (shots) {
    mkdirSync(shots, { recursive: true })
    writeFileSync(join(shots, 'printed.pdf'), bytes)
  }
  await context.close()
})

const PIXEL = `
import sys
from PIL import Image
image = Image.open(sys.argv[1]).convert("RGB")
print(";".join("%d,%d,%d" % image.getpixel((int(sys.argv[i]), int(sys.argv[i + 1]))) for i in range(2, len(sys.argv), 2)))
`

test('an object hanging over the page edge continues into the bleed; the margin beyond it stays white', async ({ browser }) => {
  test.skip(spawnSync('pdftoppm', ['-v']).error !== undefined, 'pdftoppm (poppler) is needed to look at the printed page')
  const owner = await open(browser, account, '/dashboard')
  const document = {
    schemaVersion: 1,
    width: 400,
    height: 300,
    unit: 'px',
    pages: [
      {
        id: 'probe',
        background: { type: 'solid', color: '#fde68a' },
        // 100 px wide, centred on the right edge of the page: half of it is outside the trim
        objects: [{ id: 'edge', type: 'rect', left: 400, top: 150, width: 100, height: 100, fill: '#ff0000', scaleX: 1, scaleY: 1, angle: 0, originX: 'center', originY: 'center' }],
      },
    ],
  }
  const id = await createDesign(owner, document as never, 'Bleed probe')
  await owner.context.close()
  const { page, context } = await open(browser, account, `/design/${id}`)
  await page.waitForSelector('[data-artboard] .doory-canvas', { timeout: 30_000 })
  const dialog = await openDialog(page)
  await dialog.getByRole('radio', { name: /Print-quality PDF/ }).check()
  await dialog.getByRole('radio', { name: /Standard print/ }).check()
  const pending = page.waitForEvent('download', { timeout: 120_000 })
  await dialog.getByRole('button', { name: 'Download', exact: true }).click()
  const bytes = readFileSync(((await (await pending).path()) as string))

  const folder = mkdtempSync(join(tmpdir(), 'doory-print-'))
  writeFileSync(join(folder, 'probe.pdf'), bytes)
  execFileSync('pdftoppm', ['-r', '96', '-png', '-singlefile', join(folder, 'probe.pdf'), join(folder, 'probe')])
  // 96 dpi: one px per CSS px. The sheet is 400 + 2 x (3 mm bleed + 6 mm slug) = about 468 px wide; the trim box starts at
  // 34 px, its right edge is at 434 px, the bleed ends at 445 px, the slug beyond it is white.
  const probes = [[440, 184], [448, 184], [440, 120], [200, 184], [10, 184]]
  const read = execFileSync(python, ['-I', '-c', PIXEL, join(folder, 'probe.png'), ...probes.flat().map(String)]).toString().trim().split(';')
  const [bleedHit, beyondBleed, bleedAboveObject, insideTrim, slug] = read
  expect(bleedHit).toBe('255,0,0') // the object goes on into the bleed
  expect(beyondBleed).toBe('255,255,255') // ... and stops where the bleed stops
  expect(bleedAboveObject).toBe('253,230,138') // the background continues into the bleed too
  expect(insideTrim).toBe('253,230,138')
  expect(slug).toBe('255,255,255')
  if (shots) {
    mkdirSync(shots, { recursive: true })
    writeFileSync(join(shots, 'bleed-probe.pdf'), bytes)
  }
  await context.close()
})

test('Screen setup: pages have their own size and no extra boxes', async ({ browser }) => {
  const { page, context } = await openDesign(browser)
  const dialog = await openDialog(page)
  await dialog.getByRole('radio', { name: /Print-quality PDF/ }).check()
  const pending = page.waitForEvent('download', { timeout: 120_000 })
  await dialog.getByRole('button', { name: 'Download', exact: true }).click()
  const pdf = readPdf(readFileSync(((await (await pending).path()) as string)))
  expect(pdf.pages).toHaveLength(3)
  pdf.pages.forEach((p, i) => {
    expect(p.media[2] - p.media[0]).toBeCloseTo(SIZES[i].width * PT_PER_PX, 1)
    expect(p.media[3] - p.media[1]).toBeCloseTo(SIZES[i].height * PT_PER_PX, 1)
    expect(p.trim).toBeNull()
    expect(p.bleed).toBeNull()
  })
  await context.close()
})

test('a range of pages prints only those pages, each at its own size', async ({ browser }) => {
  const { page, context } = await openDesign(browser)
  const dialog = await openDialog(page)
  await dialog.getByRole('radio', { name: /Print-quality PDF/ }).check()
  await dialog.getByRole('button', { name: /More settings/ }).click()
  await dialog.getByRole('radio', { name: 'Select pages' }).check()
  await dialog.getByRole('textbox', { name: 'Select pages' }).fill('2-3')
  await expect(dialog.getByTestId('print-summary')).toHaveText('2 pages · 2 sizes: A4, 400×300')
  const pending = page.waitForEvent('download', { timeout: 120_000 })
  await dialog.getByRole('button', { name: 'Download', exact: true }).click()
  const pdf = readPdf(readFileSync(((await (await pending).path()) as string)))
  expect(pdf.pages).toHaveLength(2)
  expect(pdf.pages[0].media[2]).toBeCloseTo(SIZES[1].width * PT_PER_PX, 1)
  expect(pdf.pages[1].media[2]).toBeCloseTo(SIZES[2].width * PT_PER_PX, 1)
  await context.close()
})

test('a busy print service: the dialog counts down, then Try again prints', async ({ browser }) => {
  const { page, context } = await openDesign(browser)
  let calls = 0
  await page.route('**/api/v1/exports/pdf/', async (route) => {
    calls += 1
    if (calls === 1) {
      await route.fulfill({ status: 503, headers: { 'retry-after': '2', 'content-type': 'application/json' }, body: JSON.stringify({ error: { code: 'export_busy', message: 'The export service is busy. Try again in a few seconds.' } }) })
    } else {
      await route.continue()
    }
  })
  const dialog = await openDialog(page)
  await dialog.getByRole('radio', { name: /Print-quality PDF/ }).check()
  await dialog.getByRole('button', { name: 'Download', exact: true }).click()
  const problem = dialog.getByTestId('export-problem')
  await expect(problem).toContainText('busy')
  await expect(problem.getByRole('button')).toBeDisabled()
  await expect(problem.getByRole('button', { name: 'Try again', exact: true })).toBeEnabled({ timeout: 10_000 })
  const pending = page.waitForEvent('download', { timeout: 120_000 })
  await problem.getByRole('button', { name: 'Try again', exact: true }).click()
  const pdf = readPdf(readFileSync(((await (await pending).path()) as string)))
  expect(pdf.pages).toHaveLength(3)
  expect(calls).toBe(2)
  await context.close()
})

test('Cancel stops a download that is waiting for the print service', async ({ browser }) => {
  const { page, context } = await openDesign(browser)
  let aborted = false
  await page.route('**/api/v1/exports/pdf/', async (route) => {
    // Hold the request until the page gives up on it.
    await new Promise<void>((done) => {
      page.once('requestfailed', () => {
        aborted = true
        done()
      })
      setTimeout(done, 20_000)
    })
    await route.abort().catch(() => undefined)
  })
  const dialog = await openDialog(page)
  await dialog.getByRole('radio', { name: /Print-quality PDF/ }).check()
  await dialog.getByRole('button', { name: 'Download', exact: true }).click()
  await expect(dialog.getByRole('progressbar')).toBeVisible()
  await expect(dialog.getByTestId('export-stage')).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(dialog.getByRole('progressbar')).toBeHidden()
  await expect(dialog.getByTestId('export-problem')).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Download', exact: true })).toBeEnabled()
  await expect.poll(() => aborted).toBe(true)
  await context.close()
})

test('the server refuses a request whose sizes do not match the pages', async ({ browser }) => {
  const owner = await open(browser, account, '/dashboard')
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>'
  const form = new FormData()
  form.append('pages', new Blob([svg], { type: 'image/svg+xml' }), 'a.svg')
  form.append('pages', new Blob([svg], { type: 'image/svg+xml' }), 'b.svg')
  form.append('width', '10')
  form.append('height', '10')
  form.append('sizes', JSON.stringify([{ width: 10, height: 10 }]))
  const csrf = (await owner.context.cookies()).find((c) => c.name === 'csrftoken')?.value ?? ''
  const response = await owner.page.request.post('/api/v1/exports/pdf/', { multipart: form, headers: { 'X-CSRFToken': csrf } })
  expect(response.status()).toBe(400)
  const error = (await response.json()).error
  expect(error.code).toBe('validation_error')
  expect(error.fields.sizes[0]).toContain('one size per page')
  await owner.context.close()
})

test.describe('looking at it', () => {
  test.skip(!shots, 'set PRINT_SHOTS=<folder> to take the screenshots')

  for (const theme of ['light'] as const) {
    for (const width of [1440, 1024, 390]) {
      test(`the Download dialog, ${theme}, ${width} px wide`, async ({ browser }) => {
        const { page, context } = await openDesign(browser, theme, { width, height: width === 390 ? 844 : 900 })
        const dialog = await openDialog(page)
        await dialog.getByRole('radio', { name: /Print-quality PDF/ }).check()
        await dialog.getByRole('radio', { name: /Standard print/ }).check()
        await page.waitForTimeout(300)
        mkdirSync(shots, { recursive: true })
        await page.screenshot({ path: join(shots, `dialog-${theme}-${width}.png`) })
        await context.close()
      })
    }
  }
})
