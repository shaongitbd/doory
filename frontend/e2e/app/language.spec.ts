import { expect, test, createAccount, openContext } from './support/stack'
import { editorReady } from './support/editor'

test('the browser-local Settings choice survives reload and reaches the lazy editor after signing out', async ({ browser }) => {
  const account = await createAccount('Language Lea')
  const { page, context, problems } = await openContext(browser, account)
  await page.goto('/settings')
  const profile = page.getByRole('textbox', { name: 'Display name' })
  await profile.fill('An unsaved profile name')
  const updates: string[] = []
  page.on('request', (request) => {
    if (request.method() !== 'GET' && request.url().includes('/api/v1/auth/me/')) updates.push(request.url())
  })
  await page.getByRole('combobox', { name: 'UI language' }).selectOption('de')
  await expect(page.getByRole('region', { name: 'Sprache' })).toBeVisible()
  await expect(profile).toHaveValue('An unsaved profile name')
  await expect(page).toHaveURL(/\/settings$/)
  expect(updates).toEqual([])
  await page.reload()
  await expect(page.getByRole('combobox', { name: 'Sprache der Benutzeroberfläche' })).toHaveValue('de')

  await context.clearCookies()
  await page.goto('/create?w=800&h=600')
  await editorReady(page)
  await expect(page).toHaveURL(/\/local\//)
  await expect(page.getByTestId('ed-menu-view')).toHaveText('Ansicht')
  await expect(page.getByTestId('ed-topbar-title')).toHaveValue('Untitled design')
  await page.getByTestId('ed-menu-view').click()
  await page.getByRole('menuitem', { name: 'Sprache…' }).click()
  await page.getByRole('combobox', { name: 'Sprache der Benutzeroberfläche' }).selectOption('en')
  await page.getByRole('button', { name: 'Close dialog' }).click()
  await page.reload()
  await editorReady(page)
  await expect(page.getByTestId('ed-menu-view')).toHaveText('View')
  problems.assertNone()
})
