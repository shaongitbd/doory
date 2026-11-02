import { type Browser, type BrowserContext, type Page, expect } from '@playwright/test'
import { availableParallelism, loadavg } from 'node:os'

export const WEB = Number(process.env.E2E_COLLAB_PORT ?? 5380)
export const BASE = `http://localhost:${WEB}`
const PASSWORD = 'Correct-horse-battery-9'

export interface Account {
  name: string
  email: string
  state: Awaited<ReturnType<BrowserContext['storageState']>>
}

export interface Client {
  account: Account
  context: BrowserContext
  page: Page
}

interface DocObjectLike {
  id: string
  type: string
  [prop: string]: unknown
}
export interface DocLike {
  width: number
  height: number
  pages: { id: string; name?: string; objects: DocObjectLike[]; [prop: string]: unknown }[]
  [prop: string]: unknown
}

interface CollabWindow {
  __doory_collab?: {
    engine: {
      state: { doc: DocLike; selection: { ids: string[]; editing: boolean }; readOnly: boolean; title: string; history: { canUndo: boolean; canRedo: boolean } }
      select(ids: string[], pageId?: string): void
      arrange: { nudge(dx: number, dy: number): void; delete(): void }
      style: { setOpacity(value: number): void }
      undo(): Promise<void>
      redo(): Promise<void>
      persistence: { saveNow(): Promise<void> }
    }
    session: { store: { getState(): { status: string; synced: boolean; role: string | null; canWrite: boolean } }; presence: { store: { getState(): { peers: { name: string; color: string }[] } } } } | null
  }
}

let created = 0

/** Registers users through the API, once, and keeps their sessions so every test can open a fresh browser context for them. */
export async function createAccounts(browser: Browser, names: string[]): Promise<Record<string, Account>> {
  const out: Record<string, Account> = {}
  for (const name of names) {
    created += 1
    const email = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '.')}.${Date.now().toString(36)}.${created}@example.test`
    const context = await browser.newContext({ baseURL: BASE })
    await context.request.get('/api/v1/auth/csrf/')
    const csrf = (await context.cookies()).find((c) => c.name === 'csrftoken')?.value ?? ''
    const response = await context.request.post('/api/v1/auth/register/', { data: { email, password: PASSWORD, display_name: name }, headers: { 'X-CSRFToken': csrf } })
    expect(response.ok(), await response.text()).toBeTruthy()
    out[name] = { name, email, state: await context.storageState() }
    await context.close()
  }
  return out
}

/** Opens a page for the account at `path` in its own browser context (its own cookies, its own WebSocket). */
export async function open(
  browser: Browser,
  account: Account | null,
  path: string,
  options: { theme?: 'light' | 'dark'; viewport?: { width: number; height: number }; before?: (page: Page) => Promise<void> } = {},
): Promise<Client> {
  const theme = options.theme ?? 'light'
  const context = await browser.newContext({ baseURL: BASE, viewport: options.viewport ?? { width: 1440, height: 900 }, storageState: account?.state, colorScheme: theme })
  const page = await context.newPage()
  await options.before?.(page)
  await page.goto(path)
  return { account: account as Account, context, page }
}

export async function call(context: BrowserContext, method: 'get' | 'post' | 'patch' | 'put' | 'delete', url: string, data?: unknown): Promise<unknown> {
  const csrf = (await context.cookies()).find((c) => c.name === 'csrftoken')?.value ?? ''
  const response = await context.request[method](`/api/v1${url}`, { data, headers: { 'X-CSRFToken': csrf } })
  expect(response.ok(), `${method} ${url}: ${await response.text()}`).toBeTruthy()
  return response.status() === 204 ? null : response.json()
}

let ids = 0
export function rect(overrides: Record<string, unknown> = {}): DocObjectLike {
  ids += 1
  return { id: `seed-${ids}-${Math.random().toString(36).slice(2, 8)}`, type: 'rect', left: 200, top: 150, width: 120, height: 90, fill: '#2563eb', stroke: '#1c1517', strokeWidth: 0, opacity: 1, angle: 0, scaleX: 1, scaleY: 1, originX: 'center', originY: 'center', ...overrides }
}

export function textbox(overrides: Record<string, unknown> = {}): DocObjectLike {
  ids += 1
  return {
    id: `text-${ids}-${Math.random().toString(36).slice(2, 8)}`,
    type: 'textbox',
    left: 400,
    top: 80,
    width: 420,
    height: 56,
    text: 'Summer sale',
    fontSize: 48,
    fontFamily: 'Inter, sans-serif',
    fontWeight: 700,
    fill: '#1c1517',
    textAlign: 'center',
    originX: 'center',
    originY: 'center',
    angle: 0,
    scaleX: 1,
    scaleY: 1,
    ...overrides,
  }
}

export function documentOf(pages: DocObjectLike[][], size = { width: 800, height: 600 }): DocLike {
  return {
    schemaVersion: 1,
    width: size.width,
    height: size.height,
    unit: 'px',
    pages: pages.map((objects, i) => ({ id: `page-${i + 1}`, background: { type: 'solid', color: '#ffffff' }, objects })),
  } as unknown as DocLike
}

export async function createDesign(owner: Client, document: DocLike, title = 'Shared poster'): Promise<string> {
  const design = (await call(owner.context, 'post', '/designs/', { title, document })) as { id: string }
  return design.id
}

export async function createLinkWithId(owner: Client, designId: string, role: 'view' | 'comment' | 'edit', password?: string): Promise<{ id: string; token: string }> {
  return (await call(owner.context, 'post', `/designs/${designId}/share-links/`, { role, ...(password ? { password } : {}) })) as { id: string; token: string }
}

export async function createLink(owner: Client, designId: string, role: 'view' | 'comment' | 'edit', password?: string): Promise<string> {
  return (await createLinkWithId(owner, designId, role, password)).token
}

/** Waits until the editor of this page is in sync with the room. */
export async function whenLive(page: Page): Promise<void> {
  await page.waitForSelector('[data-editor-root]')
  await page.waitForFunction(() => {
    const handle = (window as unknown as CollabWindow).__doory_collab
    const state = handle?.session?.store.getState()
    return !!state && state.synced && (state.status === 'live' || state.status === 'read-only')
  })
  await page.waitForSelector('[data-artboard] .doory-canvas', { timeout: 30_000 })
}

export async function document_(page: Page): Promise<DocLike> {
  return page.evaluate(() => structuredClone((window as unknown as CollabWindow).__doory_collab!.engine.state.doc))
}

export async function objects(page: Page, pageIndex = 0): Promise<DocObjectLike[]> {
  return (await document_(page)).pages[pageIndex].objects
}

export async function objectById(page: Page, id: string): Promise<DocObjectLike | undefined> {
  return (await objects(page)).find((o) => o.id === id)
}

export async function status(page: Page): Promise<string | null> {
  return page.evaluate(() => (window as unknown as CollabWindow).__doory_collab?.session?.store.getState().status ?? null)
}

export async function select(page: Page, ids: string[]): Promise<void> {
  await page.evaluate((list) => (window as unknown as CollabWindow).__doory_collab!.engine.select(list), ids)
}

export async function nudge(page: Page, dx: number, dy = 0): Promise<void> {
  await page.evaluate(([x, y]) => (window as unknown as CollabWindow).__doory_collab!.engine.arrange.nudge(x, y), [dx, dy])
}

export async function setOpacity(page: Page, value: number): Promise<void> {
  await page.evaluate((v) => (window as unknown as CollabWindow).__doory_collab!.engine.style.setOpacity(v), value)
}

export async function removeSelected(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as CollabWindow).__doory_collab!.engine.arrange.delete())
}

export async function undo(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as CollabWindow).__doory_collab!.engine.undo())
}

export async function redo(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as CollabWindow).__doory_collab!.engine.redo())
}

export async function isEditingText(page: Page): Promise<boolean> {
  return page.evaluate(() => (window as unknown as CollabWindow).__doory_collab!.engine.state.selection.editing)
}

/** Asks the room to write the design now (what "Save now" does while live). */
export async function saveNow(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as CollabWindow).__doory_collab!.engine.persistence.saveNow())
}

export async function selectedIds(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as CollabWindow).__doory_collab!.engine.state.selection.ids)
}

export async function readOnly(page: Page): Promise<boolean> {
  return page.evaluate(() => (window as unknown as CollabWindow).__doory_collab!.engine.state.readOnly)
}

export async function openTool(page: Page, id: string): Promise<void> {
  const button = page.locator(`[data-testid="ed-add-entry-${id}"]`)
  if ((await button.getAttribute('aria-pressed')) !== 'true') await button.click()
}

export async function addShape(page: Page, id: 'rect' | 'ellipse' | 'triangle' | 'star'): Promise<void> {
  await openTool(page, 'shapes')
  await page.locator(`[data-testid="shape-${id}"]`).click()
}

/** Client coordinates of a point given in page pixels. */
export async function toClient(page: Page, x: number, y: number, pageIndex = 0): Promise<{ x: number; y: number }> {
  const doc = await document_(page)
  const box = await page.locator('[data-artboard]').nth(pageIndex).boundingBox()
  if (!box) throw new Error('artboard not found')
  const scale = box.width / doc.width
  return { x: box.x + x * scale, y: box.y + y * scale }
}

/**
 * A page's connection to the room as something a spec can cut: `down()` closes the socket and refuses new ones (and takes the
 * browser offline), `up()` lets it reconnect at once.
 */
export class Network {
  private open = new Set<{ close(options?: { code?: number; reason?: string }): void }>()
  private cut = false
  attempts = 0

  async install(page: Page): Promise<void> {
    await page.routeWebSocket(/\/ws\/designs\//, (ws) => {
      this.attempts += 1
      if (this.cut) {
        ws.close({ code: 1012, reason: 'server_restart' })
        return
      }
      ws.connectToServer()
      this.open.add(ws)
      ws.onClose(() => this.open.delete(ws))
    })
  }

  /** Refuses the room's WebSockets only; the rest of the site keeps working. */
  block(): void {
    this.cut = true
  }

  async down(page: Page): Promise<void> {
    this.cut = true
    await page.context().setOffline(true)
    for (const ws of [...this.open]) ws.close({ code: 1012, reason: 'server_restart' })
  }

  async up(page: Page): Promise<void> {
    this.cut = false
    await page.context().setOffline(false)
  }
}

/**
 * How much longer a time budget may be on a machine that is busy with other work. The budgets are written for a quiet machine and stay
 * as they are on one; with more runnable processes than processors they grow by that ratio (at most fourfold).
 */
export function allowance(): number {
  return Math.min(4, Math.max(1, loadavg()[0] / availableParallelism()))
}
