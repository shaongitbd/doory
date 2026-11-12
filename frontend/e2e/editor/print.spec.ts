/**
 * [engine] The print options of the Download dialog and the PDF the browser makes with them (no server PDF in the guest
 * editor). The same options against the real print server are in print-stack.spec.ts (`npm run e2e:print`). Opening the
 * dialog and giving a page its own size are [layout] steps.
 *
 *   PRINT_SHOTS=<folder>   also saves screenshots of the dialog (light and dark) and a picture of a printed page there
 */
import { type Page, expect, test } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { inflateSync } from 'node:zlib'
import { openDownloadDialog, openEditor } from './helpers'

const shots = process.env.PRINT_SHOTS ?? ''
const PX_PER_MM = 96 / 25.4
const PT = 0.75

const POSTER = { width: 800, height: 600 }
const FLYER = { width: 794, height: 1123 }
const CARD = { width: 336, height: 192 }

/** [layout] A poster, a flyer and a card, made the way a user would: add a page, then give it another size. */
async function openMixed(page: Page): Promise<void> {
  await openEditor(page, `doc=blank&w=${POSTER.width}&h=${POSTER.height}`)
  for (const [index, size] of [FLYER, CARD].entries()) {
    await page.getByTestId('ed-pages-add').click()
    await expect(page.locator('[data-artboard]')).toHaveCount(index + 2)
    await page.getByTestId('ed-page-size').nth(index + 1).click()
    const pop = page.getByTestId('ed-canvas-size-pop')
    await pop.getByTestId('ed-canvas-width').fill(String(size.width))
    await pop.getByTestId('ed-canvas-height').fill(String(size.height))
    await pop.getByTestId('ed-canvas-apply').click()
    await expect(pop).toBeHidden()
  }
}

/** The text of a PDF with its zlib streams expanded (page boxes sit in plain text, drawing operators in the streams). */
function pdfText(bytes: Buffer): string {
  const source = bytes.toString('latin1')
  const parts = [source]
  for (const match of source.matchAll(/stream\r?\n/g)) {
    const start = (match.index ?? 0) + match[0].length
    const end = bytes.indexOf('endstream', start)
    if (end < 0) continue
    try {
      parts.push(inflateSync(bytes.subarray(start, end)).toString('latin1'))
    } catch {
      /* an image or font stream */
    }
  }
  return parts.join('\n')
}

const mediaBoxes = (text: string): number[][] => [...text.matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)].map((m) => [Number(m[1]), Number(m[2])])

async function download(page: Page): Promise<Buffer> {
  const pending = page.waitForEvent('download', { timeout: 60_000 })
  await page.getByRole('dialog', { name: 'Download' }).getByRole('button', { name: 'Download', exact: true }).click()
  return readFileSync((await (await pending).path()) as string)
}

test.describe('[engine] print options', () => {
  test('folded PDF controls fit desktop, tablet and mobile viewports', async ({ page }) => {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 820, height: 1180 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport)
      await openEditor(page, 'doc=blank&w=559&h=794')
      for (let i = 1; i < 4; i++) await page.getByTestId('ed-pages-add').click()
      await openDownloadDialog(page)
      const dialog = page.getByRole('dialog', { name: 'Download' })
      await dialog.getByRole('radio', { name: /^PDF/ }).check()
      await dialog.getByRole('radio', { name: 'Booklet' }).check()
      await expect(dialog.getByTestId('fold-preview')).toContainText('Sheet 1, front: Page 4 | Page 1')
      await expect(dialog.getByLabel('PDF sheet sides')).toBeVisible()
      await expect(dialog.getByRole('button', { name: 'Download', exact: true })).toBeEnabled()
      expect(await dialog.evaluate((element) => element.scrollWidth > element.clientWidth + 1)).toBe(false)
      const box = await dialog.boundingBox()
      expect(box).not.toBeNull()
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1)
    }
  })

  test('a five-page booklet downloads four A4 sheet sides, or two backs for manual duplex', async ({ page }) => {
    await openEditor(page, 'doc=blank&w=559&h=794')
    for (let i = 1; i < 5; i++) await page.getByTestId('ed-pages-add').click()
    await openDownloadDialog(page)
    let dialog = page.getByRole('dialog', { name: 'Download' })
    await dialog.getByRole('radio', { name: /^PDF/ }).check()
    await dialog.getByRole('radio', { name: 'Booklet' }).check()
    await expect(dialog.getByTestId('fold-preview')).toContainText('3 blanks')
    const all = mediaBoxes(pdfText(await download(page)))
    expect(all).toHaveLength(4)
    for (const box of all) {
      expect(box[0]).toBeCloseTo(297 * PX_PER_MM * PT, 0)
      expect(box[1]).toBeCloseTo(210 * PX_PER_MM * PT, 0)
    }
    await openDownloadDialog(page)
    dialog = page.getByRole('dialog', { name: 'Download' })
    await dialog.getByRole('radio', { name: /^PDF/ }).check()
    await dialog.getByRole('radio', { name: 'Booklet' }).check()
    await dialog.getByLabel('PDF sheet sides').selectOption('back')
    expect(mediaBoxes(pdfText(await download(page)))).toHaveLength(2)
  })

  test('the print section belongs to the PDF; Standard print is 3 mm bleed and crop marks, and the preview follows', async ({ page }) => {
    await openEditor(page, 'doc=blank')
    await openDownloadDialog(page)
    const dialog = page.getByRole('dialog', { name: 'Download' })
    await expect(dialog.getByTestId('print-section')).toHaveCount(0)
    await dialog.getByRole('radio', { name: /^PDF/ }).check()
    await expect(dialog.getByTestId('print-section')).toBeVisible()
    await expect(dialog.getByRole('radio', { name: /^Screen/ })).toBeChecked()
    await expect(dialog.getByTestId('print-preview')).toHaveAttribute('data-bleed', 'false')
    await dialog.getByRole('radio', { name: /^Standard print/ }).check()
    await expect(dialog.getByRole('textbox', { name: 'Bleed' })).toHaveValue('3')
    await expect(dialog.getByRole('switch', { name: /Crop marks/ })).toBeChecked()
    await expect(dialog.getByTestId('print-preview')).toHaveAttribute('data-marks', 'true')
    await expect(dialog.getByTestId('print-colour-note')).toContainText('RGB')
    await dialog.getByRole('radio', { name: /^SVG/ }).check()
    await expect(dialog.getByTestId('print-section')).toHaveCount(0)
  })

  test('the bleed is limited to 0-10 mm and a changed number is a custom setup', async ({ page }) => {
    await openEditor(page, 'doc=blank')
    await openDownloadDialog(page)
    const dialog = page.getByRole('dialog', { name: 'Download' })
    await dialog.getByRole('radio', { name: /^PDF/ }).check()
    const bleed = dialog.getByRole('textbox', { name: 'Bleed' })
    await bleed.fill('42')
    await bleed.press('Enter')
    await expect(bleed).toHaveValue('10')
    await expect(dialog.getByRole('radio', { name: /^Custom/ })).toBeChecked()
    await bleed.fill('-3')
    await bleed.press('Enter')
    await expect(bleed).toHaveValue('0')
  })

  test('sums up the pages and their sizes', async ({ page }) => {
    await openMixed(page)
    await openDownloadDialog(page)
    const dialog = page.getByRole('dialog', { name: 'Download' })
    await dialog.getByRole('radio', { name: /^PDF/ }).check()
    await expect(dialog.getByTestId('print-summary')).toHaveText('3 pages · 3 sizes: 800×600, A4, Business card')
    await dialog.getByRole('radio', { name: 'Select pages' }).check()
    await dialog.getByRole('textbox', { name: 'Select pages' }).fill('2-3')
    await expect(dialog.getByTestId('print-summary')).toHaveText('2 pages · 2 sizes: A4, Business card')
    await dialog.getByRole('textbox', { name: 'Select pages' }).fill('7')
    await expect(dialog.getByRole('alert')).toContainText('Enter page numbers')
    await expect(dialog.getByRole('button', { name: 'Download', exact: true })).toBeDisabled()
  })

  test('the choice is remembered for this design after a reload', async ({ page }) => {
    await openEditor(page, 'doc=blank')
    await openDownloadDialog(page)
    let dialog = page.getByRole('dialog', { name: 'Download' })
    await dialog.getByRole('radio', { name: /^PDF/ }).check()
    await dialog.getByRole('radio', { name: /^Standard print/ }).check()
    await dialog.getByRole('textbox', { name: 'Bleed' }).fill('5')
    await dialog.getByRole('textbox', { name: 'Bleed' }).press('Enter')
    await page.reload()
    await page.waitForSelector('[data-artboard] .doory-canvas')
    await openDownloadDialog(page)
    dialog = page.getByRole('dialog', { name: 'Download' })
    await dialog.getByRole('radio', { name: /^PDF/ }).check()
    await expect(dialog.getByRole('textbox', { name: 'Bleed' })).toHaveValue('5')
    await expect(dialog.getByRole('radio', { name: /^Custom/ })).toBeChecked()
  })

  test('without a server PDF the browser makes the same PDF: every page has its size plus bleed and the margin of the marks', async ({ page }) => {
    await openMixed(page)
    await openDownloadDialog(page)
    const dialog = page.getByRole('dialog', { name: 'Download' })
    await expect(dialog.getByRole('radio', { name: /Print-quality PDF/ })).toHaveCount(0)
    await dialog.getByRole('radio', { name: /^PDF/ }).check()
    await dialog.getByRole('radio', { name: /^Standard print/ }).check()
    await expect(dialog.getByText(/Made in your browser/)).toBeVisible()
    const text = pdfText(await download(page))
    const boxes = mediaBoxes(text)
    expect(boxes).toHaveLength(3)
    const extra = 2 * (3 + 6) * PX_PER_MM * PT
    ;[POSTER, FLYER, CARD].forEach((size, i) => {
      expect(boxes[i][0]).toBeCloseTo(size.width * PT + extra, 0)
      expect(boxes[i][1]).toBeCloseTo(size.height * PT + extra, 0)
    })
    // eight hairlines on each of the three pages
    expect((text.match(/ l\nS/g) ?? []).length).toBe(24)
  })

  test('the Screen setup keeps the pages at their own size without marks', async ({ page }) => {
    await openMixed(page)
    await openDownloadDialog(page)
    const dialog = page.getByRole('dialog', { name: 'Download' })
    await dialog.getByRole('radio', { name: /^PDF/ }).check()
    const text = pdfText(await download(page))
    const boxes = mediaBoxes(text)
    expect(boxes).toHaveLength(3)
    ;[POSTER, FLYER, CARD].forEach((size, i) => {
      expect(boxes[i][0]).toBeCloseTo(size.width * PT, 0)
      expect(boxes[i][1]).toBeCloseTo(size.height * PT, 0)
    })
    expect((text.match(/ l\nS/g) ?? []).length).toBe(0)
  })

  test.describe('looking at it', () => {
    test.skip(!shots, 'set PRINT_SHOTS=<folder> to take the screenshots')

    test('a page of the demo design printed by the browser, with bleed and crop marks', async ({ page }) => {
      await openEditor(page, 'doc=demo')
      await openDownloadDialog(page)
      const dialog = page.getByRole('dialog', { name: 'Download' })
      await dialog.getByRole('radio', { name: /^PDF/ }).check()
      await dialog.getByRole('radio', { name: /^Standard print/ }).check()
      await dialog.getByRole('radio', { name: 'Current page' }).check()
      mkdirSync(shots, { recursive: true })
      writeFileSync(join(shots, 'client-printed.pdf'), await download(page))
    })

    for (const theme of ['light'] as const) {
      for (const [width, height] of [[1440, 900], [1024, 768], [390, 844]]) {
        test(`the Download dialog, ${theme}, ${width} px wide`, async ({ page }) => {
          await page.setViewportSize({ width, height })
          await page.emulateMedia({ colorScheme: theme })
          await openEditor(page, `doc=blank&theme=${theme}`)
          await page.keyboard.press('Control+Shift+D') // the top bar has no Download button on a phone
          const dialog = page.getByRole('dialog', { name: 'Download' })
          await dialog.getByRole('radio', { name: /^PDF/ }).check()
          await dialog.getByRole('radio', { name: /^Standard print/ }).check()
          await page.waitForTimeout(300)
          mkdirSync(shots, { recursive: true })
          await page.screenshot({ path: join(shots, `harness-dialog-${theme}-${width}.png`) })
        })
      }
    }
  })
})
