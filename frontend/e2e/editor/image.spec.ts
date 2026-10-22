/**
 * [layout] The Image drawer and the image toolbar; the engine behaviour behind them is covered by unit tests.
 * [engine] specs must keep passing in any chrome; [layout] specs target the current UI and are to be rewritten with it.
 */
import { type Page, expect, test } from '@playwright/test'
import { getDoc, openEditor, openTool, pageObjects, pngBuffer, toolbarOf, waitForObjectCount } from './helpers'

async function uploadImage(page: Page): Promise<void> {
  await openTool(page, 'image')
  const chooser = page.waitForEvent('filechooser')
  await page.getByTestId('upload-zone').click()
  await (await chooser).setFiles({ name: 'swatch.png', mimeType: 'image/png', buffer: pngBuffer(240, 160) })
  await page.getByTestId('uploaded-thumb').filter({ hasText: 'swatch.png' }).click()
  await waitForObjectCount(page, 1)
}

const toolbar = toolbarOf

test.describe('[layout] images', () => {
  test('upload goes through the adapter, lists in the Image drawer and the thumbnail adds the image', async ({ page }) => {
    await openEditor(page, 'doc=blank')
    await uploadImage(page)
    const img = (await pageObjects(page))[0]
    expect(img.type).toBe('image')
    expect(String(img.docSrc ?? img.src)).not.toMatch(/^(blob:|data:)/)
    const uploads = await page.evaluate(() => window.__doory!.uploads)
    expect(uploads).toHaveLength(1)
    expect(uploads[0].name).toBe('swatch.png')
    await openTool(page, 'image')
    await expect(page.getByTestId('uploaded-thumb').filter({ hasText: 'swatch.png' })).toBeVisible()
    const box = img as unknown as { width: number; scaleX: number }
    expect(box.width * box.scaleX).toBeLessThanOrEqual(1080)
  })

  test('rejects files that are not images with a toast and adds nothing', async ({ page }) => {
    await openEditor(page, 'doc=blank')
    await openTool(page, 'image')
    const chooser = page.waitForEvent('filechooser')
    await page.getByTestId('upload-zone').click()
    await (await chooser).setFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') })
    await expect(page.getByRole('status').or(page.getByRole('alert')).filter({ hasText: /could not be added|not supported|image/i }).first()).toBeVisible()
    expect((await pageObjects(page)).length).toBe(0)
  })

  test('flip, filters and frame update the document and are undoable', async ({ page }) => {
    await openEditor(page, 'doc=blank')
    await uploadImage(page)
    await toolbar(page).getByRole('button', { name: 'Flip horizontal' }).click()
    await expect.poll(async () => (await pageObjects(page))[0].flipX).toBe(true)

    await toolbar(page).getByRole('button', { name: 'Adjust' }).click()
    await page.getByRole('slider', { name: 'Brightness' }).fill('0.4')
    await expect
      .poll(async () => ((await pageObjects(page))[0].filters as { type: string; value: number }[] | undefined)?.find((f) => f.type === 'brightness')?.value)
      .toBeCloseTo(0.4, 1)
    await page.keyboard.press('Escape')

    await toolbar(page).getByRole('button', { name: 'Frame' }).click()
    await page.getByRole('button', { name: 'Circle', exact: true }).click()
    await expect.poll(async () => (await pageObjects(page))[0].maskShape).toBe('circle')
    await page.keyboard.press('Escape')

    await page.keyboard.press('Control+z')
    await expect.poll(async () => (await pageObjects(page))[0].maskShape).toBeUndefined()
    await page.keyboard.press('Control+Shift+z')
    await expect.poll(async () => (await pageObjects(page))[0].maskShape).toBe('circle')
  })

  test('crop mode shows a frame, applies a narrower crop and cancels with Escape', async ({ page }) => {
    await openEditor(page, 'doc=blank')
    await uploadImage(page)
    const before = (await pageObjects(page))[0]
    await toolbar(page).getByRole('button', { name: 'Crop' }).click()
    await expect(toolbar(page).getByRole('button', { name: 'Done' })).toBeVisible()
    await toolbar(page).getByRole('button', { name: '1:1', exact: true }).click()
    await toolbar(page).getByRole('button', { name: 'Done' }).click()
    await expect.poll(async () => {
      const o = (await pageObjects(page))[0]
      return Math.abs(((o.width as number) * (o.scaleX as number)) / ((o.height as number) * (o.scaleY as number)) - 1)
    }).toBeLessThan(0.05)
    const after = (await pageObjects(page))[0]
    expect(after.id).toBe(before.id)

    await toolbar(page).getByRole('button', { name: 'Crop' }).click()
    await page.keyboard.press('Escape')
    await expect(toolbar(page).getByRole('button', { name: 'Done' })).toHaveCount(0)
    expect((await getDoc(page)).pages[0].objects).toHaveLength(1)
  })

  test('replace image keeps the frame and the object id', async ({ page }) => {
    await openEditor(page, 'doc=blank')
    await uploadImage(page)
    const id = (await pageObjects(page))[0].id
    const chooser = page.waitForEvent('filechooser')
    await toolbar(page).getByRole('button', { name: 'Replace image' }).click()
    await (await chooser).setFiles({ name: 'other.png', mimeType: 'image/png', buffer: pngBuffer(100, 100, [30, 64, 175]) })
    await expect.poll(async () => page.evaluate(() => window.__doory!.uploads.length)).toBe(2)
    expect((await pageObjects(page))[0].id).toBe(id)
  })

  test('upscale doubles the source resolution, keeps the displayed frame and is undoable', async ({ page }) => {
    await openEditor(page, 'doc=blank')
    await uploadImage(page)
    const before = (await pageObjects(page))[0]
    const sourceWidth = before.width as number
    const displayedWidth = sourceWidth * (before.scaleX as number)

    await toolbar(page).getByRole('button', { name: 'Upscale' }).click()
    const dialog = page.getByRole('dialog', { name: 'Upscale image' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('radio', { name: '2×' }).check()
    await dialog.getByRole('button', { name: 'Upscale', exact: true }).click()

    await expect.poll(async () => page.evaluate(() => window.__doory!.uploads.length), { timeout: 20_000 }).toBe(2)
    await expect.poll(async () => (await pageObjects(page))[0].width).toBe(sourceWidth * 2)
    const after = (await pageObjects(page))[0]
    expect(after.id).toBe(before.id)
    expect(Math.abs((after.width as number) * (after.scaleX as number) - displayedWidth)).toBeLessThan(2)

    await page.keyboard.press('Control+z')
    await expect.poll(async () => (await pageObjects(page))[0].width).toBe(sourceWidth)
  })

  test('upscale keeps the crop of a cropped photo and the uncropped source', async ({ page }) => {
    await openEditor(page, 'doc=blank')
    await uploadImage(page)
    await toolbar(page).getByRole('button', { name: 'Crop' }).click()
    await toolbar(page).getByRole('button', { name: '1:1', exact: true }).click()
    await toolbar(page).getByRole('button', { name: 'Done' }).click()
    await expect.poll(async () => (await pageObjects(page))[0].cropX).toBe(40)

    const before = (await pageObjects(page))[0]
    const cropX = before.cropX as number
    const cropWidth = before.width as number
    const displayedWidth = cropWidth * (before.scaleX as number)

    await toolbar(page).getByRole('button', { name: 'Upscale' }).click()
    const dialog = page.getByRole('dialog', { name: 'Upscale image' })
    await dialog.getByRole('radio', { name: '2×' }).check()
    await dialog.getByRole('button', { name: 'Upscale', exact: true }).click()

    await expect.poll(async () => page.evaluate(() => window.__doory!.uploads.length), { timeout: 20_000 }).toBe(2)
    await expect.poll(async () => (await pageObjects(page))[0].cropX).toBe(cropX * 2)
    const after = (await pageObjects(page))[0]
    expect(after.width).toBe(cropWidth * 2)
    expect(Math.abs((after.width as number) * (after.scaleX as number) - displayedWidth)).toBeLessThan(2)
  })
})
