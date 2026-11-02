import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { openEditor, pageObjects } from './helpers'

// Optional local media checks; the sample files live outside the repository.
test.skip(!process.env.DOORY_SAMPLE_DIR, 'Set DOORY_SAMPLE_DIR to a folder containing the sample assets')

const files = ['mw-example.jpg', 'sunflowers.jpg', 'transparency.png', 'svg-logo.svg']

for (const viewport of [{ width: 1024, height: 600 }, { width: 390, height: 844 }, { width: 1920, height: 1200 }]) {
  test(`sample images upload at ${viewport.width} by ${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await openEditor(page, 'doc=blank&mode=account')
    await page.getByTestId('ed-add-entry-image').click()
    const chooser = page.waitForEvent('filechooser')
    await page.getByTestId('upload-zone').click()
    await (await chooser).setFiles(files.map((file) => join(process.env.DOORY_SAMPLE_DIR!, file)))
    await expect(page.getByTestId('uploaded-thumb')).toHaveCount(files.length)
    await page.getByTestId('uploaded-thumb').filter({ hasText: 'transparency.png' }).click()
    await expect.poll(async () => (await pageObjects(page)).length).toBe(1)
  })
}

for (const file of ['flower.mp4', 'flower.webm']) {
  test(`${file} loads and plays in the browser`, async ({ page }) => {
    const path = join(process.env.DOORY_SAMPLE_DIR!, file).replaceAll('\\', '/')
    await page.goto(`file:///${path}`)
    const video = page.locator('video')
    await expect(video).toBeVisible()
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.duration)).toBeGreaterThan(0)
    await video.evaluate((element: HTMLVideoElement) => element.play())
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(0)
  })
}
