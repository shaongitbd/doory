/**
 * [layout] Top-bar tools, drawers and sidebars and the shortcuts dialog of the current layout.
 * [engine] specs must keep passing in any chrome; [layout] specs target the current UI and are to be rewritten with it.
 */
import { expect, test } from '@playwright/test'
import { addShape, moreMenu, openEditor, openTool, pageObjects, toolbarOf, waitForObjectCount } from './helpers'

test.describe('[layout] chrome', () => {
  test('? opens the shortcuts dialog, filters it and Escape closes it', async ({ page }) => {
    await openEditor(page, 'doc=blank')
    await page.keyboard.press('Shift+?')
    const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('Undo', { exact: true })).toBeVisible()
    await dialog.getByRole('searchbox', { name: 'Filter shortcuts' }).fill('group')
    await expect(dialog.getByText('Group', { exact: true }).first()).toBeVisible()
    await expect(dialog.getByText('Undo', { exact: true })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
  })

  test('colour picker: hex validation, swatches and alpha', async ({ page }) => {
    await openEditor(page, 'doc=blank')
    await addShape(page, 'rect')
    await waitForObjectCount(page, 1)
    await toolbarOf(page).getByTestId('ed-fill').click()
    await page.getByTestId('ed-fill-custom').click()
    const hex = page.getByLabel('Hex color')
    await hex.fill('#12ab3')
    await expect(hex).toHaveAttribute('aria-invalid', 'true')
    const fillBefore = (await pageObjects(page))[0].fill
    await hex.press('Enter')
    expect((await pageObjects(page))[0].fill).toEqual(fillBefore)
    await hex.fill('#ff8800')
    // A typed 6-digit colour keeps the alpha the shape already had (new shapes start translucent).
    await expect.poll(async () => String((await pageObjects(page))[0].fill)).toMatch(/^#ff8800(40)?$/)
    await page.getByRole('button', { name: 'Back to colors' }).click()
    await page.getByRole('button', { name: 'Use #1c1517' }).first().click()
    await expect.poll(async () => (await pageObjects(page))[0].fill).toBe('#1c1517')
    // The popover stays open after a swatch, so the custom view is one click away.
    await page.getByTestId('ed-fill-custom').click()
    await page.getByRole('textbox', { name: 'Alpha' }).fill('50')
    await expect.poll(async () => String((await pageObjects(page))[0].fill)).toMatch(/rgba\(28, ?21, ?23, ?0\.5\)|#1c151780/)
  })

  test('tools stay open while the canvas is used, switch directly and close from inside', async ({ page }) => {
    await openEditor(page, 'doc=blank')
    const text = page.getByTestId('ed-add-entry-text')
    await text.click()
    await expect(page.getByTestId('drawer-text')).toBeVisible()
    await expect(text).toHaveAttribute('aria-pressed', 'true')
    // A docked tool closes when its rail button is pressed again.
    const clickLikeAUser = async (locator: ReturnType<typeof page.getByTestId>): Promise<void> => {
      const box = await locator.boundingBox()
      if (!box) throw new Error('no box')
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    }
    await clickLikeAUser(text)
    await expect(page.getByTestId('drawer-text')).toHaveCount(0)
    await text.click()
    await page.getByRole('img', { name: 'Design canvas, page 1' }).click({ position: { x: 100, y: 100 } })
    await expect(page.getByTestId('drawer-text')).toBeVisible()
    await page.getByTestId('ed-add-entry-shapes').click()
    await expect(page.getByTestId('drawer-text')).toHaveCount(0)
    await expect(page.getByTestId('drawer-shapes')).toBeVisible()
    await page.getByTestId('drawer-shapes').getByRole('button').first().focus()
    await page.keyboard.press('Escape')
    // The docked Sticker sidebar is not a popover: it opens at once and closes with its own button.
    await page.getByTestId('ed-add-entry-elements').click()
    await expect(page.getByTestId('drawer-shapes')).toHaveCount(0)
    await expect(page.getByTestId('sidebar-elements')).toBeVisible()
    await page.getByTestId('sidebar-close').click()
    await expect(page.getByTestId('sidebar-elements')).toHaveCount(0)
    await openTool(page, 'layers')
    await expect(page.getByTestId('sidebar-layers')).toBeVisible()
  })
})

test.describe('[layout] keyboard and focus', () => {
  test('the top-bar tools are one tab stop with arrow-key navigation; Enter opens a drawer and Escape returns focus', async ({ page }) => {
    await openEditor(page, 'doc=blank&mode=account')
    const text = page.getByTestId('ed-add-entry-text')
    const sticker = page.getByTestId('ed-add-entry-elements')
    await text.focus()
    await page.keyboard.press('ArrowRight')
    await expect(sticker).toBeFocused()
    await page.keyboard.press('ArrowLeft')
    await expect(text).toBeFocused()
    await page.keyboard.press('Enter')
    const drawer = page.getByTestId('drawer-text')
    await expect(drawer).toBeVisible()
    await expect(drawer.getByTestId('text-preset-heading')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(drawer).toHaveCount(0)
    await expect(text).toBeFocused()
  })

  test('a dialog traps focus, closes with Escape and gives focus back to its opener', async ({ page }) => {
    await openEditor(page, 'doc=blank&mode=account')
    const share = page.getByTestId('ed-share')
    await share.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Share design' })
    await expect(dialog).toBeVisible()
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab')
      expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true)
    }
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(share).toBeFocused()
  })

  test('the contextual row is a toolbar with arrow-key navigation', async ({ page }) => {
    await openEditor(page, 'doc=blank')
    await addShape(page, 'rect')
    await waitForObjectCount(page, 1)
    const bar = toolbarOf(page)
    await bar.getByTestId('ed-fill').focus()
    await page.keyboard.press('ArrowRight')
    await expect(bar.getByTestId('ed-stroke')).toBeFocused()
    await page.keyboard.press('Home')
    await expect(bar.getByRole('button').first()).toBeFocused()
  })

  test('menus take focus, move with the arrow keys and close with Escape', async ({ page }) => {
    await openEditor(page, 'doc=blank&mode=account')
    const more = page.getByTestId('ed-more')
    await more.click()
    const menu = page.getByRole('menu', { name: 'More' })
    await expect(menu).toBeVisible()
    await expect(menu.getByRole('menuitem').first()).toBeFocused()
    await page.keyboard.press('ArrowDown')
    // Arrow keys skip disabled items ("Reset design" is disabled until the design changes).
    await expect(menu.getByRole('menuitem').first()).not.toBeFocused()
    await expect(menu.locator('[role="menuitem"]:focus')).toHaveCount(1)
    await expect(menu.locator('[role="menuitem"][aria-disabled="true"]:focus')).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
    await expect(more).toBeFocused()
  })

  test('Reset design in the More menu goes back to how the design was opened and can be undone', async ({ page }) => {
    await openEditor(page, 'doc=blank')
    await page.getByTestId('ed-more').click()
    await expect(page.getByRole('menuitem', { name: 'Reset design' })).toBeDisabled()
    await page.keyboard.press('Escape')
    await addShape(page, 'rect')
    await waitForObjectCount(page, 1)
    await moreMenu(page, 'Reset design')
    await waitForObjectCount(page, 0)
    await page.keyboard.press('ControlOrMeta+z')
    await waitForObjectCount(page, 1)
  })
})
