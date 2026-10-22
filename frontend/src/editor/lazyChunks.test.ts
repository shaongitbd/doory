import { describe, expect, it } from 'vitest'

/**
 * The editor's first load is the code its entry reaches through static imports. Parts that
 * only some sessions use must sit behind `import()` (see `ui/loadable.tsx`); one static import of them from the eager side
 * would pull the whole feature back into the first download, and nothing would fail except the page getting slower. This
 * reads the sources, so it holds whatever the bundler does; `npm run bundle:check` measures the real bytes after a build.
 */
const sources = import.meta.glob<string>(['/src/**/*.{ts,tsx}', '!/src/**/*.test.{ts,tsx}'], { query: '?raw', import: 'default', eager: true })

const ENTRY = '/src/editor/index.tsx'

/** Resolves an import specifier of `from` to a source path (`@/` is `/src/`); `null` for packages and assets. */
function resolve(specifier: string, from: string): string | null {
  let base: string
  if (specifier.startsWith('@/')) base = `/src/${specifier.slice(2)}`
  else if (specifier.startsWith('.')) {
    const parts = from.split('/').slice(0, -1)
    for (const part of specifier.split('/')) {
      if (part === '..') parts.pop()
      else if (part !== '.') parts.push(part)
    }
    base = parts.join('/')
  } else return null
  return [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`].find((candidate) => candidate in sources) ?? null
}

const STATIC = /^\s*(?:import|export)\s+(?!type[\s{])[^;'"]*?(?:from\s+)?['"]([^'"]+)['"]/gm

/** Every module the editor entry reaches without crossing an `import()`, with the module that first pulled it in. */
function eagerClosure(entry: string): Map<string, string | null> {
  const seen = new Map<string, string | null>([[entry, null]])
  const queue = [entry]
  while (queue.length > 0) {
    const path = queue.pop() as string
    for (const match of sources[path].matchAll(STATIC)) {
      const next = resolve(match[1], path)
      if (next && !seen.has(next)) {
        seen.set(next, path)
        queue.push(next)
      }
    }
  }
  return seen
}

const chain = (closure: Map<string, string | null>, path: string): string => {
  const names: string[] = []
  for (let at: string | null | undefined = path; at; at = closure.get(at)) names.push(at.replace('/src/editor/', ''))
  return names.join(' <- ')
}

/** The parts that load on first use, and what makes each of them worth a chunk. */
const LAZY: Record<string, string> = {
  '/src/editor/panels/AnimatePanel.tsx': 'Animate panel',
  '/src/editor/workspace/Timeline.tsx': 'timeline',
  '/src/editor/workspace/TimelinePreview.tsx': 'animation preview over the page',
  '/src/editor/workspace/TimelineAudio.tsx': 'audio rows of the timeline',
  '/src/editor/panels/AudioPanel.tsx': 'audio panel',
  '/src/editor/panels/AudioSync.tsx': 'audio player glue',
  '/src/editor/panels/VideosPanel.tsx': 'videos panel',
  '/src/editor/workspace/TimelineClips.tsx': 'video rows of the timeline',
  '/src/editor/toolbar/sections/clip.tsx': 'video clip toolbar',
  '/src/editor/panels/CommentsPanel.tsx': 'comments panel',
  '/src/editor/panels/CommentsIcon.tsx': 'comments count in the top bar',
  '/src/editor/workspace/CommentPins.tsx': 'comment pins on the pages',
  '/src/editor/panels/TemplatesPanel.tsx': 'templates panel',
  '/src/editor/panels/BrandPanel.tsx': 'brand panel',
  '/src/editor/fonts/UploadFontDialog.tsx': 'font upload dialog',
  '/src/editor/dialogs/DownloadDialog.tsx': 'download dialog (print options, video)',
  '/src/editor/dialogs/ShareDialog.tsx': 'share dialog',
  '/src/editor/dialogs/VersionsDialog.tsx': 'version history',
  '/src/editor/dialogs/ResizeDialog.tsx': 'resize dialog',
  '/src/editor/dialogs/ShortcutsDialog.tsx': 'shortcuts dialog',
  '/src/editor/dialogs/BackgroundRemovalDialog.tsx': 'background removal dialog',
  '/src/editor/dialogs/Presenter.tsx': 'presenter',
  '/src/editor/collab/session.ts': 'live editing (Yjs, binding)',
  '/src/editor/collab/room.ts': 'live editing room (Yjs)',
}

describe('lazy editor chunks', () => {
  const closure = eagerClosure(ENTRY)

  it('finds the entry and follows imports', () => {
    expect(closure.has('/src/editor/EditorApp.tsx')).toBe(true)
    expect(closure.has('/src/editor/engine/editor.ts')).toBe(true)
    expect(closure.size).toBeGreaterThan(150)
  })

  it.each(Object.entries(LAZY))('%s (%s) is not imported statically by the eager editor', (path) => {
    expect(path in sources, `${path} no longer exists: update LAZY in lazyChunks.test.ts`).toBe(true)
    expect(closure.has(path) ? chain(closure, path) : null).toBeNull()
  })

  it('every lazy part is reached by an import() from somewhere', () => {
    const dynamic = Object.values(sources).join('\n')
    for (const path of Object.keys(LAZY)) {
      const file = path.split('/').pop()?.replace(/\.tsx?$/, '') as string
      expect(dynamic, `${file} has no import() left`).toMatch(new RegExp(`import\\(\\s*['"][^'"]*/${file}['"]\\s*\\)`))
    }
  })

  it('registers every command, panel, dialog and timeline section from the eager editor, not from a lazy chunk', () => {
    // A registration at the top level of a module happens when the module loads. In a lazy chunk it would only happen once
    // that chunk had been downloaded: the shortcut, the menu entry or the row would not exist before then.
    const registersOnLoad = /^register[A-Za-z]*\(/m
    const late = Object.keys(sources).filter((path) => path.startsWith('/src/editor/') && registersOnLoad.test(sources[path]) && !closure.has(path))
    expect(late, 'these register something when they load, but only a lazy chunk loads them: import them from EditorApp.tsx').toEqual([])
  })

  it('stays within the budget for eager source (a coarse guard; the build measures the real bytes)', () => {
    const bytes = [...closure.keys()].reduce((sum, path) => sum + sources[path].length, 0)
    // Move new rarely used features behind loadable() instead of raising this.
    expect(bytes).toBeLessThan(1_200_000)
  })
})
