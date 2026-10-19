/**
 * Dev/e2e harness UI: mounts `EditorApp` with an in-memory adapter. Served by Vite at /editor-harness.html
 * (it is not part of the production build). Query parameters:
 *   mode=guest|account|shared-view|shared-comment   theme=light|dark   contrast=more|standard
 *   doc=demo|blank|stress|deck|animated|stored
 *   pages=N&objects=M (stress)   w=…&h=… (blank)   saveDelay=ms
 *   viewer=owner|commenter|anonymous (who looks at the comments)   comments=demo|N (threads to start with)   commentLatency=ms
 */
import { Moon, Sun } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { EditorHandle, EditorMode, SaveState } from '@/types/adapter'
import type { DoryDocument } from '@/types/document'
import '@/styles/tokens.css'
import { initContrast, setContrastPreference } from '@/lib/contrast'
import { EditorApp } from '../EditorApp'
import { createAnimatedDemo, createBlankDemo, createDeckDemo, createDemoDocument, createStressDocument } from './demoDocument'
import { createMemoryAdapter } from './memoryAdapter'

declare global {
  interface Window {
    __doory?: {
      saves: ReturnType<typeof createMemoryAdapter>['saves']
      uploads: ReturnType<typeof createMemoryAdapter>['uploads']
      accountRequests: string[]
      saveStates: SaveState[]
      failNextSave(kind: 'conflict' | 'error'): void
      getDocument(): DoryDocument
      isDirty(): boolean
      saveNow(): Promise<void>
      conflictChoices: string[]
      titles: string[]
      comments: ReturnType<typeof createMemoryAdapter>['comments']
    }
  }
}

const params = new URLSearchParams(location.search)
const mode = (params.get('mode') ?? 'guest') as EditorMode
const theme = params.get('theme')
if (theme === 'dark' || theme === 'light') document.documentElement.dataset.theme = theme
initContrast()
const contrast = params.get('contrast')
if (contrast === 'more' || contrast === 'standard') setContrastPreference(contrast)

function initialDocument(): DoryDocument {
  const kind = params.get('doc') ?? 'demo'
  if (kind === 'blank') return createBlankDemo(Number(params.get('w') ?? 1080), Number(params.get('h') ?? 1080))
  if (kind === 'deck') return createDeckDemo()
  if (kind === 'animated') return createAnimatedDemo()
  // The design a spec saved in this browser (`localStorage['doory.harness.doc']`): how "reload keeps it" is tested.
  if (kind === 'stored') {
    try {
      const raw = localStorage.getItem('doory.harness.doc')
      if (raw) return JSON.parse(raw) as DoryDocument
    } catch {
      /* storage blocked or not JSON: fall back to the demo design */
    }
  }
  if (kind === 'stress') return createStressDocument(Number(params.get('pages') ?? 30), Number(params.get('objects') ?? 200))
  return createDemoDocument()
}

const style = document.createElement('style')
style.textContent = `
  html, body, #root { height: 100%; margin: 0; }
  body { background: var(--color-bg); color: var(--color-text); font-family: var(--font-sans); }
  .harness-logo { display: inline-flex; align-items: center; gap: 8px; padding: 0 8px; font: 800 18px var(--font-display); letter-spacing: -0.02em; color: var(--color-brand); }
  .harness-logo i { width: 22px; height: 22px; border-radius: 7px; background: var(--color-brand); display: inline-block; }
  @media (max-width: 640px) { .harness-logo b { display: none; } }
  .harness-btn { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 8px; border: 0; background: transparent; color: var(--color-text-muted); cursor: pointer; } .harness-btn:hover { background: var(--color-bg-muted); color: var(--color-text); }
`
document.head.appendChild(style)

export function Harness() {
  const ref = useRef<EditorHandle>(null)
  const handle = useState(() => {
    const viewer = params.get('viewer')
    const created = createMemoryAdapter({
      saveDelayMs: Number(params.get('saveDelay') ?? 0),
      account: mode === 'account' || mode === 'shared-comment',
      commentRole: viewer === 'owner' || viewer === 'commenter' || viewer === 'anonymous' ? viewer : mode === 'shared-comment' ? 'commenter' : 'owner',
      commentSeed: params.get('comments'),
    })
    created.comments.setLatency(Number(params.get('commentLatency') ?? 0))
    return created
  })[0]
  const doc = useState(initialDocument)[0]
  const [title, setTitle] = useState('Untitled design')
  const [dark, setDark] = useState(document.documentElement.dataset.theme === 'dark')

  useEffect(() => {
    handle.bindDocument(() => ref.current?.getDocument() as DoryDocument)
    const states: SaveState[] = []
    window.__doory = {
      saves: handle.saves,
      uploads: handle.uploads,
      accountRequests: handle.accountRequests,
      saveStates: states,
      failNextSave: handle.failNextSave,
      getDocument: () => ref.current?.getDocument() as DoryDocument,
      isDirty: () => ref.current?.isDirty() ?? false,
      saveNow: () => ref.current?.saveNow() ?? Promise.resolve(),
      conflictChoices: [],
      titles: [],
      comments: handle.comments,
    }
  }, [handle])

  return (
    <EditorApp
      ref={ref}
      document={doc}
      meta={{ id: 'harness', title, mode }}
      adapter={handle.adapter}
      onTitleChange={(t) => {
        setTitle(t)
        window.__doory?.titles.push(t)
      }}
      onSaveStateChange={(s) => window.__doory?.saveStates.push(s)}
      onConflictResolve={(c) => window.__doory?.conflictChoices.push(c)}
      topBarStart={
        <span className="harness-logo">
          <i /> <b>Doory</b>
        </span>
      }
      topBarEnd={
        <button
          type="button"
          className="harness-btn"
          aria-label="Toggle theme"
          aria-pressed={dark}
          title="Toggle theme"
          onClick={() => {
            const next = !dark
            document.documentElement.dataset.theme = next ? 'dark' : 'light'
            setDark(next)
          }}
        >
          {dark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
        </button>
      }
    />
  )
}
