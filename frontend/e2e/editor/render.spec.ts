/**
 * [engine] The headless render page (render.html) the server draws design pages on for image export: its PNG must match
 * the editor's own PNG download of the same page.
 */
import { type Page, expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import fixture from '../../src/editor/engine/fixtures/backend-builders.json' with { type: 'json' }
import type { RenderInput } from './globals'
import { openEditor, pngBuffer } from './helpers'

type DocObject = Record<string, unknown> & { type: string }

const PICTURE = `data:image/png;base64,${pngBuffer(120, 80, [30, 120, 200]).toString('base64')}`

/** Every object the backend's builders make (text, effects, curved text, shapes, masks, groups, QR), on one page. */
function contractDesign(): Record<string, unknown> {
  const objects = (fixture as { name: string; object: DocObject }[]).map((c, i) => {
    const object: DocObject = { ...structuredClone(c.object), id: `o${i}` }
    if (object.type === 'image') object.src = PICTURE
    return object
  })
  return {
    schemaVersion: 1,
    width: 1200,
    height: 900,
    unit: 'px',
    pages: [{ id: 'contract', background: { type: 'gradient', kind: 'linear', angle: 45, stops: [{ offset: 0, color: '#ffe1e6' }, { offset: 1, color: '#e0f0ff' }] }, objects }],
  }
}

/** The editor's PNG download of its current page at 1×. */
async function editorPng(page: Page): Promise<string> {
  await page.locator('[data-testid="ed-share"]').click()
  await page.getByRole('menuitem', { name: 'More options…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Download' })
  await dialog.getByRole('radio', { name: /^PNG/ }).check()
  await dialog.getByRole('radio', { name: 'Current page' }).check()
  await dialog.getByRole('radio', { name: '1×' }).check()
  const pending = page.waitForEvent('download', { timeout: 30_000 })
  await dialog.getByRole('button', { name: 'Download', exact: true }).click()
  return (await readFile(await (await pending).path())).toString('base64')
}

async function openRenderPage(page: Page): Promise<void> {
  await page.goto('/render.html')
  await page.waitForFunction(() => window.__dooryRenderReady === true)
}

/** The harness's font catalogue, as the server would send the catalogue entries a design uses. */
async function harnessFonts(page: Page): Promise<NonNullable<RenderInput['fonts']>> {
  return page.evaluate(async () => {
    const { createMemoryAdapter } = await import('/src/editor/dev/memoryAdapter.ts' as string)
    return (await createMemoryAdapter().adapter.services.fonts.list({ page_size: 100 })).results
  })
}

/** Share of pixels whose channels differ by more than a few levels (anti-aliasing noise). */
async function differingShare(page: Page, a: string, b: string): Promise<{ share: number; sizes: number[][] }> {
  return page.evaluate(
    async ([one, two]) => {
      const decode = async (b64: string) => {
        const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob())
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(bitmap, 0, 0)
        return ctx.getImageData(0, 0, bitmap.width, bitmap.height)
      }
      const [x, y] = await Promise.all([decode(one), decode(two)])
      const sizes = [
        [x.width, x.height],
        [y.width, y.height],
      ]
      if (x.width !== y.width || x.height !== y.height) return { share: 1, sizes }
      let differing = 0
      for (let i = 0; i < x.data.length; i += 4) {
        if (Math.max(...[0, 1, 2, 3].map((k) => Math.abs(x.data[i + k] - y.data[i + k]))) > 8) differing++
      }
      return { share: differing / (x.width * x.height), sizes }
    },
    [a, b],
  )
}

test.describe('[engine] headless render page', () => {
  for (const [name, setup] of [
    ['the demo design', async () => 'doc=demo'],
    ['every object the backend builds', async (page: Page) => {
      await page.addInitScript((doc) => localStorage.setItem('doory.harness.doc', doc), JSON.stringify(contractDesign()))
      return 'doc=stored'
    }],
  ] as const) {
    test(`matches the editor's PNG download: ${name}`, async ({ page }) => {
      await openEditor(page, await setup(page))
      const doc = await page.evaluate(() => window.__doory!.getDocument())
      const downloaded = await editorPng(page)

      await openRenderPage(page)
      const out = await page.evaluate((input) => window.__dooryRender!(input), { document: doc, page: 0, multiplier: 1, fonts: await harnessFonts(page) })
      if (!out.ok) throw new Error(`render failed: ${out.error.message}`)
      expect([out.width, out.height]).toEqual([doc.pages[0].width ?? doc.width, doc.pages[0].height ?? doc.height])
      expect(out.placeholders).toBe(0)

      const { share, sizes } = await differingShare(page, downloaded, out.png)
      expect(sizes[0]).toEqual(sizes[1])
      expect(share).toBeLessThanOrEqual(0.01)
    })
  }

  test('reports pictures that did not load, missing fonts and bad requests', async ({ page }) => {
    await openRenderPage(page)
    const document = {
      schemaVersion: 1,
      width: 300,
      height: 200,
      unit: 'px',
      pages: [
        {
          id: 'p1',
          background: { type: 'solid', color: '#ffffff' },
          objects: [
            { id: 'img', type: 'image', src: '/media/does-not-exist.png', left: 0, top: 0, width: 50, height: 50 },
            { id: 't', type: 'textbox', text: 'Hello', fontFamily: 'No Such Font', fontSize: 30, left: 60, top: 60, width: 200 },
          ],
        },
      ],
    }
    const out = await page.evaluate((input) => window.__dooryRender!(input), { document, multiplier: 2, transparent: true })
    if (!out.ok) throw new Error(out.error.message)
    expect(out).toMatchObject({ width: 600, height: 400, pageId: 'p1', pageIndex: 0, placeholders: 1, missingFonts: ['No Such Font'] })

    const missing = await page.evaluate((input) => window.__dooryRender!(input), { document, page: 'nope' })
    expect(missing).toEqual({ ok: false, error: { code: 'page_not_found', message: expect.stringContaining('nope') } })
  })
})
