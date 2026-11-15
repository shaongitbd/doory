import { expect, test } from '@playwright/test'
import { installMockApi, makeUser } from './support/mockApi'

test('English startup leaves the German bundles unloaded; both selectors switch and persist', async ({ page }) => {
  await installMockApi(page, { user: makeUser() })
  const germanRequests: string[] = []
  page.on('request', request => {
    if (/\/(?:de\.json|functions-de(?:\.ts|-[^/]+\.js)|de-[^/]+\.js)(?:\?|$)/.test(request.url())) germanRequests.push(request.url())
  })
  await page.goto('/')
  await expect(page.getByRole('combobox', { name: 'Language', exact: true })).toHaveValue('en')
  expect(germanRequests).toEqual([])
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('de')
  await expect(page.locator('html')).toHaveAttribute('lang', 'de')
  await expect(page.getByRole('banner').getByRole('link', { name: 'Funktionen', exact: true })).toBeVisible()
  expect(germanRequests.length).toBeGreaterThan(0)
  expect(await page.evaluate(() => localStorage.getItem('doory.locale'))).toBe('de')
  await page.reload()
  await expect(page.getByRole('combobox', { name: 'Sprache', exact: true })).toHaveValue('de')
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Einstellungen', exact: true })).toBeVisible()
  const selector = page.getByRole('combobox', { name: 'Sprache', exact: true })
  await expect(selector).toHaveValue('de')
  await selector.selectOption('en')
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
  await page.getByRole('combobox', { name: 'Language / 语言 / 語言', exact: true }).selectOption('de')
  await expect(page.getByRole('heading', { name: 'Barrierefreiheit', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('combobox', { name: 'Sprache', exact: true })).toHaveValue('de')
  await page.getByRole('combobox', { name: 'Sprache', exact: true }).selectOption('en')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('doory.locale'))).toBe('en')
})

test('German browser preference loads the catalog before the first page', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'de-AT' })
  const page = await context.newPage()
  try {
    await installMockApi(page)
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('lang', 'de')
    await expect(page.getByRole('combobox', { name: 'Sprache', exact: true })).toHaveValue('de')
    await expect(page.getByRole('banner').getByRole('link', { name: 'Funktionen', exact: true })).toBeVisible()
    await page.getByRole('link', { name: 'Ein Design erstellen', exact: true }).click()
    await expect(page.locator('[data-editor-root]')).toBeVisible()
    await expect(page.getByTestId('ed-share')).toHaveAccessibleName(/Teilen/)
    await expect(page.getByRole('button', { name: 'Datei', exact: true })).toBeVisible()
  } finally { await context.close() }
})
