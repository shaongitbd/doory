import { expect, test } from '@playwright/test'
import { openEditor } from './helpers'

test('desktop tool rail scrolls to lower tools without clipping its buttons', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 })
  await openEditor(page, 'doc=blank&mode=account')

  const rail = page.getByTestId('ed-tool-rail')
  const layers = page.getByTestId('ed-add-entry-layers')
  const before = await rail.evaluate((element) => ({ height: element.clientHeight, content: element.scrollHeight }))
  expect(before.content).toBeGreaterThan(before.height)
  await layers.focus()
  await expect(layers).toBeFocused()
  await expect(layers).toBeInViewport()
  await layers.click()
  await expect(page.getByTestId('sidebar-layers')).toBeVisible()

  const sizes = await rail.evaluate((element) => {
    const button = element.querySelector<HTMLElement>('[data-tool="layers"]')!
    return { rail: element.getBoundingClientRect().width, button: button.getBoundingClientRect().width }
  })
  expect(sizes.rail).toBe(80)
  expect(sizes.button).toBeLessThanOrEqual(sizes.rail)
})

test('the tool rail stays horizontal below the desktop breakpoint', async ({ page }) => {
  await page.setViewportSize({ width: 1023, height: 600 })
  await openEditor(page, 'doc=blank&mode=account')
  await expect(page.getByTestId('ed-tool-rail')).toHaveAttribute('data-orientation', 'horizontal')
  await page.getByTestId('ed-add-entry-image').click()
  await expect(page.getByTestId('sheet-image')).toBeVisible()
})

test('the full desktop rail fits at 1920 by 1200', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1200 })
  await openEditor(page, 'doc=blank&mode=account')
  const rail = page.getByTestId('ed-tool-rail')
  await expect(rail).toHaveAttribute('data-orientation', 'vertical')
  const sizes = await rail.evaluate((element) => ({ height: element.clientHeight, content: element.scrollHeight }))
  expect(sizes.content).toBeLessThanOrEqual(sizes.height)
})
