import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { addShape, getDoc, openEditor, waitForObjectCount } from './helpers'

async function openLanguage(page: Page) {
  const opener = page.getByTestId('ed-menu-view').or(page.getByTestId('ed-more'))
  await opener.click()
  await page.getByRole('menuitem', { name: /^(Language|Sprache)…$/ }).click()
  return page.getByRole('dialog', { name: /^(Language|Sprache)$/ })
}

test.describe('UI language', () => {
  test.use({ locale: 'de-DE' })

  test('follows the browser, persists explicit choices and can return to browser detection', async ({ page }) => {
    await openEditor(page, 'doc=blank')
    await expect(page.locator('html')).toHaveAttribute('lang', 'de')
    await expect(page.getByTestId('ed-menu-view')).toHaveText('Ansicht')
    let dialog = await openLanguage(page)
    await expect(dialog.getByRole('combobox')).toHaveValue('system')
    await dialog.getByRole('combobox').selectOption('en')
    await expect(dialog).toHaveAccessibleName('Language')
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await page.reload()
    await expect(page.getByTestId('ed-menu-view')).toHaveText('View')
    dialog = await openLanguage(page)
    await expect(dialog.getByRole('combobox')).toHaveValue('en')
    await dialog.getByRole('combobox').selectOption('system')
    await expect(dialog).toHaveAccessibleName('Sprache')
    expect(await page.evaluate(() => localStorage.getItem('doory.ui.language.v1'))).toBeNull()
  })

  test('keeps the mounted editor and design intact, with no additional saves', async ({ page }) => {
    await openEditor(page, 'doc=blank')
    await addShape(page, 'rect')
    await waitForObjectCount(page, 1)
    await expect.poll(() => page.evaluate(() => window.__doory!.isDirty())).toBe(false)
    const original = await getDoc(page)
    const nodes = await page.evaluateHandle(() => ({ root: document.querySelector('[data-editor-root]'), canvas: document.querySelector('.lower-canvas'), handle: window.__doory }))
    const saves = await page.evaluate(() => window.__doory!.saves.length)
    const dialog = await openLanguage(page)
    await dialog.getByRole('combobox').selectOption('en')
    await expect(dialog).toHaveAccessibleName('Language')
    await dialog.getByRole('combobox').selectOption('de')
    await expect(dialog).toHaveAccessibleName('Sprache')
    await page.getByRole('button', { name: 'Dialog schließen' }).click()
    expect(await getDoc(page)).toEqual(original)
    expect(await nodes.evaluate((before) => before.root === document.querySelector('[data-editor-root]') && before.canvas === document.querySelector('.lower-canvas') && before.handle === window.__doory)).toBe(true)
    expect(await page.evaluate(() => window.__doory!.saves.length)).toBe(saves)
    await nodes.dispose()
  })

  for (const mode of ['guest', 'shared-view']) {
    test(`allows ${mode} users to switch language using the keyboard`, async ({ page }) => {
      await openEditor(page, `doc=blank&mode=${mode}`)
      const dialog = await openLanguage(page)
      const select = dialog.getByRole('combobox')
      await expect(select).toBeFocused()
      await select.press('End')
      await expect(select).toHaveValue('de')
      await expect(dialog.getByRole('button', { name: 'Dialog schließen' })).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(dialog).toHaveCount(0)
      await expect(page.getByTestId('ed-menu-view')).toBeFocused()
      await expect(page.getByTestId('ed-topbar-title')).toHaveValue('Untitled design')
    })
  }

  for (const width of [1440, 390]) {
    test(`German language controls fit at ${width}px in high contrast and pass focused accessibility checks`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await openEditor(page, 'doc=blank&contrast=more')
      await page.getByTestId('ed-menu-view').or(page.getByTestId('ed-more')).click()
      const menu = page.getByRole('menu')
      const clipped = await menu.locator('[data-item="view.playPage"] > span, [data-item="guides"] > span').evaluateAll((elements) => elements.filter((element) => element.scrollWidth > element.clientWidth + 1).map((element) => element.textContent))
      expect(clipped).toEqual([])
      await page.keyboard.press('Escape')
      const dialog = await openLanguage(page)
      await expect(dialog.getByRole('combobox', { name: 'Sprache der Benutzeroberfläche' })).toHaveValue('system')
      const bounds = await dialog.boundingBox()
      expect(bounds!.x).toBeGreaterThanOrEqual(0)
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
      expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
      const scan = await new AxeBuilder({ page }).include('[role="dialog"]').analyze()
      expect(scan.violations).toEqual([])
    })
  }
})
