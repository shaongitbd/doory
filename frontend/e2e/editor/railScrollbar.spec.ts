import { expect, test } from '@playwright/test'
import { openEditor } from './helpers'

for (const viewport of [{ width: 1024, height: 600 }, { width: 1280, height: 600 }]) {
  test(`desktop tools scroll at ${viewport.width} by ${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await openEditor(page, 'doc=blank&mode=account')

    const rail = page.getByTestId('ed-tool-rail')
    const layers = page.getByTestId('ed-add-entry-layers')
    await expect(rail).toHaveAttribute('data-orientation', 'vertical')
    const before = await rail.evaluate((element) => ({
      height: element.clientHeight,
      content: element.scrollHeight,
      scrollbar: getComputedStyle(element).scrollbarWidth,
      width: element.getBoundingClientRect().width,
    }))
    expect(before.content).toBeGreaterThan(before.height)
    expect(before.scrollbar).not.toBe('none')
    expect(before.width).toBe(80)

    const box = await rail.boundingBox()
    if (!box) throw new Error('Tool rail is missing')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.wheel(0, 600)
    await expect.poll(() => rail.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)

    await layers.focus()
    await expect(layers).toBeInViewport()
    const bounds = await rail.evaluate((element) => {
      const button = element.querySelector<HTMLElement>('[data-tool="layers"]')!
      return { rail: element.getBoundingClientRect().right, button: button.getBoundingClientRect().right }
    })
    expect(bounds.button).toBeLessThanOrEqual(bounds.rail)
    await layers.click()
    await expect(page.getByTestId('sidebar-layers')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(layers).toBeFocused()
  })
}

for (const viewport of [{ width: 1366, height: 768 }, { width: 1920, height: 1200 }]) {
  test(`desktop rail fits at ${viewport.width} by ${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await openEditor(page, 'doc=blank&mode=account')
    const rail = page.getByTestId('ed-tool-rail')
    await expect(rail).toHaveAttribute('data-orientation', 'vertical')
    const sizes = await rail.evaluate((element) => ({ height: element.clientHeight, content: element.scrollHeight }))
    expect(sizes.content).toBeLessThanOrEqual(sizes.height)
  })
}

for (const viewport of [{ width: 1023, height: 600 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
  test(`mobile tool bar stays usable at ${viewport.width} by ${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await openEditor(page, 'doc=blank&mode=account')
    const rail = page.getByTestId('ed-tool-rail')
    await expect(rail).toHaveAttribute('data-orientation', 'horizontal')
    await expect(rail).toHaveCSS('scrollbar-width', 'none')
    await page.getByTestId('ed-add-entry-image').click()
    await expect(page.getByTestId('sheet-image')).toBeVisible()
    await page.getByTestId('sheet-close').click()
    await page.getByTestId('ed-add-entry-layers').click()
    await expect(page.getByTestId('sheet-layers')).toBeVisible()
  })
}
