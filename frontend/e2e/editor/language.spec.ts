import { expect, test, type Page } from '@playwright/test'
import { addShape, getDoc, openDownloadDialog, openEditor, openTool, toClient, waitForObjectCount } from './helpers'

async function activateLocale(page: Page, locale: 'en' | 'de') {
  await page.evaluate(async locale => {
    const modulePath = '/src/i18n/catalog.ts'
    const { activateLocale } = await import(/* @vite-ignore */ modulePath)
    await activateLocale(locale)
  }, locale)
}

for (const element of ['shortcuts', 'context menu', 'download'] as const) {
  test(`refreshes the open ${element} English → German → English without losing state`, async ({ page }) => {
    await openEditor(page, 'doc=blank&saveDelay=60000')
    await addShape(page, 'rect')
    await waitForObjectCount(page, 1)
    const before = await getDoc(page)
    const root = await page.locator('[data-editor-root]').elementHandle()
    const title = page.getByTestId('ed-topbar-title')
    await title.fill('Keep {name}.doory')
    await page.keyboard.press('Enter')
    if (element === 'shortcuts') {
      await page.getByRole('button', { name: 'View', exact: true }).click()
      await page.getByRole('menuitem', { name: /Keyboard shortcuts/ }).click()
      await page.getByRole('searchbox').fill('S')
    } else if (element === 'context menu') {
      const point = await toClient(page, before.width / 2, before.height / 2)
      await page.mouse.click(point.x, point.y, { button: 'right' })
    } else {
      await openDownloadDialog(page)
      await page.locator('[data-purpose="graphic"]').click()
    }
    const surface = page.getByRole(element === 'context menu' ? 'menu' : 'dialog')
    await expect(surface).toBeVisible()
    const mounted = await surface.elementHandle()
    for (const locale of ['en', 'de', 'en'] as const) {
      await activateLocale(page, locale)
      if (element === 'shortcuts') {
        await expect(surface.locator('dt').filter({ hasText: locale === 'de' ? /^Jetzt speichern$/ : /^Save now$/ })).toBeVisible()
        await expect(surface.getByRole('searchbox')).toHaveValue('S')
      } else if (element === 'context menu') {
        await expect(surface.getByRole('menuitem', { name: locale === 'de' ? /^Kopieren/ : /^Copy/ })).toBeVisible()
      } else {
        await expect(surface.getByRole('heading', { name: locale === 'de' ? 'Verwenden für' : 'What is it for?' })).toBeVisible()
        if (locale === 'de') await expect(surface.getByRole('button', { name: /Weitere Einstellungen/ })).toContainText('Alle Seiten')
        const graphic = surface.locator('[data-purpose="graphic"]')
        await expect(graphic).toContainText(locale === 'de' ? 'Grafik mit Transparenz' : 'Graphic with transparency')
        await expect(graphic).toContainText(locale === 'de' ? 'PNG · ohne Hintergrund' : 'PNG · no background')
        await expect(graphic).toHaveAttribute('aria-pressed', 'true')
      }
      expect(await mounted!.evaluate(element => element.isConnected)).toBe(true)
      expect(await root!.evaluate(element => element.isConnected)).toBe(true)
      expect(await getDoc(page)).toEqual(before)
      await expect(title).toHaveValue('Keep {name}.doory')
    }
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: /^Undo/ }).click()
    await waitForObjectCount(page, 0)
    await page.getByRole('button', { name: /^Redo/ }).click()
    await waitForObjectCount(page, 1)
  })
}

test('refreshes German animation and transition wording without changing the page or selected effect', async ({ page }) => {
  await openEditor(page, 'doc=blank&saveDelay=60000')
  await addShape(page, 'rect')
  await openTool(page, 'animate')
  for (const locale of ['en', 'de', 'en'] as const) {
    await activateLocale(page, locale)
    await expect(page.getByTestId('animate-enter-rise')).toHaveText(locale === 'de' ? 'Von unten einblenden' : 'Rise')
  }
  await page.getByRole('radio', { name: 'Page', exact: true }).click()
  await page.getByTestId('animate-transition-push').click()
  const before = await getDoc(page)
  const panel = await page.getByTestId('animate-panel').elementHandle()
  const labels = [
    ['dissolve', 'Dissolve', 'Auflösen'], ['wipe', 'Wipe', 'Wischen'], ['blinds', 'Blinds', 'Jalousie'],
    ['fade', 'Fade', 'Überblenden'], ['push', 'Push', 'Verschieben'], ['cover', 'Cover', 'Überdecken'], ['uncover', 'Uncover', 'Freilegen'],
  ]
  for (const locale of ['en', 'de', 'en'] as const) {
    await activateLocale(page, locale)
    for (const [id, english, german] of labels) await expect(page.getByTestId(`animate-transition-${id}`)).toHaveText(locale === 'de' ? german : english)
    await expect(page.getByTestId('animate-style-rise')).toHaveText(locale === 'de' ? 'Von unten einblenden' : 'Rise')
    if (locale === 'de') await expect(page.getByText('Wähle einen Effekt, um alle Elemente dieser Seite nacheinander zu animieren.')).toBeVisible()
    await expect(page.getByTestId('animate-transition-push')).toHaveAttribute('aria-pressed', 'true')
    expect(await panel!.evaluate(element => element.isConnected)).toBe(true)
    expect(await getDoc(page)).toEqual(before)
  }
})

for (const [slot, tab, preset, english, german] of [
  ['enter', 'Enter', 'fade', 'Fade', 'Einblenden'],
  ['exit', 'Exit', 'bounce', 'Bounce', 'Hüpfen'],
  ['emphasis', 'Emphasis', 'wiggle', 'Wiggle', 'Wackeln'],
] as const) {
  test(`refreshes the open Element ${tab} cards and keeps selected animation settings`, async ({ page }) => {
    await openEditor(page, 'doc=blank&saveDelay=60000')
    await addShape(page, 'rect')
    await openTool(page, 'animate')
    await page.getByRole('radio', { name: tab, exact: true }).click()
    await page.getByTestId(`animate-${slot}-${preset}`).click()
    const duration = page.getByRole('textbox', { name: 'Duration', exact: true })
    await duration.fill('1.7')
    await duration.press('Enter')
    const delay = page.getByRole('textbox', { name: 'Delay', exact: true })
    await delay.fill('0.3')
    await delay.press('Enter')
    await page.getByTestId('animate-easing').selectOption('linear')
    const before = await getDoc(page)
    const panel = await page.getByTestId('animate-panel').elementHandle()
    const settings = await page.getByTestId('animate-settings').elementHandle()
    for (const locale of ['en', 'de', 'en'] as const) {
      await activateLocale(page, locale)
      const label = locale === 'de' ? german : english
      const card = page.getByTestId(`animate-${slot}-${preset}`)
      await expect(card).toHaveText(label)
      await expect(card).toHaveAccessibleName(label)
      await expect(card).toHaveAttribute('title', new RegExp(label))
      await expect(card).toHaveAttribute('aria-pressed', 'true')
      await expect(page.getByRole('heading', { name: `${locale === 'de' ? 'Einstellungen' : 'Settings'}: ${label}`, exact: true })).toBeVisible()
      await expect(page.getByRole('textbox', { name: locale === 'de' ? 'Dauer' : 'Duration', exact: true })).toHaveValue('1.7')
      await expect(page.getByRole('textbox', { name: locale === 'de' ? 'Verzögerung' : 'Delay', exact: true })).toHaveValue('0.3')
      await expect(page.getByTestId('animate-easing')).toHaveValue('linear')
      if (slot === 'emphasis') await expect(page.getByTestId('animate-emphasis-shake')).toHaveAccessibleName(locale === 'de' ? 'Schütteln' : 'Shake')
      expect(await panel!.evaluate(element => element.isConnected)).toBe(true)
      expect(await settings!.evaluate(element => element.isConnected)).toBe(true)
      expect(await getDoc(page)).toEqual(before)
    }
  })
}

// Test the mounted editor independently of the app router's separate remount behavior.
test('changes English commands and tools to German without resetting the mounted editor', async ({ page }) => {
  await openEditor(page, 'doc=blank&saveDelay=60000')
  await addShape(page, 'rect')
  await waitForObjectCount(page, 1)
  const before = await getDoc(page)
  const root = await page.locator('[data-editor-root]').elementHandle()
  const title = page.getByTestId('ed-topbar-title')
  await title.fill('Keep {name} – User title')
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Layers', exact: true }).click()
  await expect(page.getByRole('complementary', { name: 'Layers' })).toBeVisible()
  await page.getByRole('button', { name: 'File', exact: true }).click()
  await expect(page.getByRole('menuitem', { name: /Save now/ })).toBeVisible()

  await page.evaluate(async () => {
    const modulePath = '/src/i18n/catalog.ts'
    const { activateLocale } = await import(/* @vite-ignore */ modulePath)
    await activateLocale('de')
  })

  await expect(page.getByRole('menuitem', { name: /Jetzt speichern/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Datei', exact: true })).toBeVisible()
  await expect(page.getByRole('complementary', { name: 'Ebenen' })).toBeVisible()
  await expect(page.getByTestId('ed-add-entry-shapes')).toHaveText('Formen')
  await expect(title).toHaveValue('Keep {name} – User title')
  expect(await root!.evaluate(element => element.isConnected)).toBe(true)
  expect(await getDoc(page)).toEqual(before)
  // The selected rectangle and its undo history survive; no saved-document reload can pass this.
  await expect(page.getByRole('toolbar', { name: 'Formatierung' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: /^Rückgängig/ }).click()
  await waitForObjectCount(page, 0)
  await page.getByRole('button', { name: /^Wiederholen/ }).click()
  await waitForObjectCount(page, 1)

  await page.evaluate(async () => {
    const modulePath = '/src/i18n/catalog.ts'
    const { activateLocale } = await import(/* @vite-ignore */ modulePath)
    await activateLocale('en')
  })
  await expect(page.getByRole('button', { name: 'File', exact: true })).toBeVisible()
  await expect(page.getByTestId('ed-add-entry-shapes')).toHaveText('Shapes')
})
