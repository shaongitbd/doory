import zhCN from '../../src/i18n/zh-CN.json' with { type: 'json' }
import zhTW from '../../src/i18n/zh-TW.json' with { type: 'json' }
import type { Request } from '@playwright/test'
import { expect, test, createAccount, openContext } from './support/stack'
import { editorReady } from './support/editor'

interface EngineState {
  doc: unknown
  title: string
  selection: { ids: string[] }
  history: { canUndo: boolean; canRedo: boolean }
  activePageId: string
}

interface EditorWindow {
  __doory_collab: {
    engine: {
      state: EngineState
      history: unknown
      adapter: { save(...args: unknown[]): Promise<unknown> }
      store: { subscribe(listener: (next: EngineState, previous: EngineState) => void): () => void }
      insert: { shape(kind: string): Promise<void> }
      arrange: { nudge(dx: number, dy: number): void }
      sealHistory(): void
      undo(): Promise<void>
      stop(): void
      setTitle(title: string): void
      openDialog(id: string): void
      viewOf(pageId: string): unknown
      persistence: { isDirty(): boolean; saveNow(): Promise<void> }
    }
    session: {
      store: { getState(): { synced: boolean } }
      awareness: { getLocalState(): unknown }
      ydoc: { on(event: 'update', listener: () => void): void; off(event: 'update', listener: () => void): void }
    } | null
  }
}

// These checks use the existing dev-only engine handle and Vite module URLs to change language while in the editor.
for (const mode of ['guest', 'account'] as const) {
  test(`${mode}: language changes update the routed editor without replacing its state or saving`, async ({ browser }) => {
    test.skip(process.env.E2E_APP_PROD === 'true', 'Requires the development editor handle')
    const account = mode === 'account' ? await createAccount('Language switch') : null
    const { page, problems } = await openContext(browser, account)
    await page.clock.install()
    await page.goto('/create?w=800&h=600')
    await editorReady(page)
    await expect.poll(() => page.evaluate(() => !!(window as unknown as EditorWindow).__doory_collab)).toBe(true)
    if (mode === 'account') {
      await expect.poll(() => page.evaluate(() => (window as unknown as EditorWindow).__doory_collab.session?.store.getState().synced)).toBe(true)
    }

    await page.evaluate(async () => {
      const path = '/src/i18n/catalog.ts'
      const { loadLocale } = await import(/* @vite-ignore */ path)
      await Promise.all([loadLocale('zh-CN'), loadLocale('zh-TW')])
      const { engine } = (window as unknown as EditorWindow).__doory_collab
      await engine.insert.shape('rect')
      await engine.persistence.saveNow()
      engine.sealHistory()
      engine.arrange.nudge(5, 0)
      engine.sealHistory()
      engine.arrange.nudge(10, 0)
      await engine.undo()
      engine.openDialog('shortcuts')
    })
    const filter = page.getByRole('searchbox', { name: 'Filter shortcuts' })
    await filter.fill('z')
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100))
    await page.evaluate(() => (window as unknown as EditorWindow).__doory_collab.engine.setTitle('Unsaved title'))

    const before = await page.evaluateHandle(() => {
      const handle = (window as unknown as EditorWindow).__doory_collab
      const { engine, session } = handle
      const changes = { documents: 0, saves: 0, stops: 0, updates: 0 }
      const save = engine.adapter.save.bind(engine.adapter)
      engine.adapter.save = (...args) => { changes.saves++; return save(...args) }
      const stop = engine.stop.bind(engine)
      engine.stop = () => { changes.stops++; stop() }
      const unsubscribe = engine.store.subscribe((next, previous) => {
        if (next.doc !== previous.doc) changes.documents++
      })
      const onUpdate = () => { changes.updates++ }
      session?.ydoc.on('update', onUpdate)
      return {
        engine, session, changes, unsubscribe, onUpdate,
        doc: engine.state.doc,
        title: engine.state.title,
        selection: engine.state.selection,
        history: engine.state.history,
        entries: JSON.stringify(engine.history),
        view: engine.viewOf(engine.state.activePageId),
        root: document.querySelector('[data-editor-root]'),
        canvas: document.querySelector('.lower-canvas'),
        filter: document.querySelector('[data-autofocus]'),
        collab: session?.store.getState(),
        presence: JSON.stringify(session?.awareness.getLocalState()),
        dirty: engine.persistence.isDirty(),
        url: location.href,
      }
    })
    expect(await before.evaluate(snapshot => snapshot.history)).toMatchObject({ canUndo: true, canRedo: true })
    expect(await before.evaluate(snapshot => snapshot.dirty)).toBe(true)
    const state = await before.evaluate(snapshot => ({ title: snapshot.title, ids: snapshot.selection.ids, canUndo: snapshot.history.canUndo, canRedo: snapshot.history.canRedo }))
    const writes: string[] = []
    const onRequest = (request: Request) => {
      if (request.method() !== 'GET' && request.url().includes('/api/v1/')) writes.push(request.url())
    }
    page.on('request', onRequest)

    for (const [locale, catalog] of [['zh-CN', zhCN], ['zh-TW', zhTW], ['en', null]] as const) {
      await page.evaluate(async (choice) => {
        const path = '/src/i18n/catalog.ts'
        const { activateLocale } = await import(/* @vite-ignore */ path)
        await activateLocale(choice)
      }, locale)
      await page.clock.runFor(32)
      expect(await before.evaluate(snapshot => {
        const current = (window as unknown as EditorWindow).__doory_collab
        return {
          engine: current.engine === snapshot.engine,
          document: current.engine.state.doc === snapshot.doc,
          title: current.engine.state.title === snapshot.title,
          selection: current.engine.state.selection === snapshot.selection,
          history: current.engine.state.history === snapshot.history && JSON.stringify(current.engine.history) === snapshot.entries,
          view: current.engine.viewOf(current.engine.state.activePageId) === snapshot.view,
          root: document.querySelector('[data-editor-root]') === snapshot.root,
          canvas: document.querySelector('.lower-canvas') === snapshot.canvas,
          filter: document.querySelector('[data-autofocus]') === snapshot.filter,
          dirty: current.engine.persistence.isDirty() === snapshot.dirty,
          session: current.session === snapshot.session,
          collab: current.session?.store.getState() === snapshot.collab,
          presence: JSON.stringify(current.session?.awareness.getLocalState()) === snapshot.presence,
          url: location.href === snapshot.url,
          state: { title: current.engine.state.title, ids: current.engine.state.selection.ids, canUndo: current.engine.state.history.canUndo, canRedo: current.engine.state.history.canRedo },
        }
      })).toEqual({ engine: true, document: true, title: true, selection: true, history: true, view: true, root: true, canvas: true, filter: true, dirty: true, session: true, collab: true, presence: true, url: true, state })
      await expect(page.getByTestId('ed-menu-file')).toHaveText(catalog?.['topbar.file'] ?? 'File')
      await expect(page.getByRole('searchbox', { name: catalog?.['dialog.shortcutsFilter'] ?? 'Filter shortcuts' })).toHaveValue('z')
      await expect(page.getByRole('dialog', { name: catalog?.['dialog.shortcutsTitle'] ?? 'Keyboard shortcuts' })).toBeVisible()
      await expect(page.getByRole('img', { name: locale === 'en' ? 'Design canvas, page 1' : locale === 'zh-CN' ? '设计画布，页 1' : '設計畫布，頁 1' })).toBeAttached()
      expect(await before.evaluate(snapshot => snapshot.changes)).toEqual({ documents: 0, saves: 0, stops: 0, updates: 0 })
      expect(writes).toEqual([])
    }

    page.off('request', onRequest)
    await before.evaluate(snapshot => {
      snapshot.unsubscribe()
      snapshot.session?.ydoc.off('update', snapshot.onUpdate)
    })
    // The pending user edit still saves; only language changes must be inert.
    await page.clock.runFor(2000)
    await expect.poll(() => before.evaluate(snapshot => snapshot.engine.persistence.isDirty())).toBe(false)
    await before.dispose()
    problems.assertNone()
  })
}

// Settings is a separate route: this checks the visible selector, not uninterrupted editor state preservation.
test('Settings language selector updates labels, keeps the profile draft and persists across reloads', async ({ browser }) => {
  const account = await createAccount('Language selector')
  const { page, problems } = await openContext(browser, account)
  await page.goto('/settings')
  const language = page.getByRole('combobox', { name: 'Language / 语言 / 語言' })
  await expect(language).toHaveValue('en')
  await page.getByRole('textbox', { name: 'Display name' }).fill('Unsaved profile draft')
  const writes: string[] = []
  page.on('request', (request) => {
    if (request.method() !== 'GET' && request.url().includes('/api/v1/')) writes.push(request.url())
  })

  await language.selectOption('zh-TW')
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW')
  await expect(language).toHaveValue('zh-TW')
  await expect(page.getByRole('heading', { level: 1, name: zhTW['app.Settings'] })).toBeVisible()
  await expect(page.getByRole('region', { name: zhTW['app.Accessibility'] })).toBeVisible()
  await expect(page.getByRole('textbox', { name: zhTW['app.Display name'] })).toHaveValue('Unsaved profile draft')
  expect(await page.evaluate(() => localStorage.getItem('doory.locale'))).toBe('zh-TW')
  await expect(page).toHaveURL(/\/settings$/)

  await page.reload()
  await expect(language).toHaveValue('zh-TW')
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW')
  await expect(page.getByRole('heading', { level: 1, name: zhTW['app.Settings'] })).toBeVisible()
  await expect(page.getByRole('textbox', { name: zhTW['app.Display name'] })).toHaveValue(account.name)

  await language.selectOption('en')
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  expect(await page.evaluate(() => localStorage.getItem('doory.locale'))).toBe('en')
  await page.reload()
  await expect(language).toHaveValue('en')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
  expect(writes).toEqual([])
  problems.assertNone()
})
