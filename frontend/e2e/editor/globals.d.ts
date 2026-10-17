import type { SaveInput, SaveState } from '../../src/types/adapter'
import type { DoryDocument } from '../../src/types/document'

/** A comment as the in-memory service (src/editor/dev/memoryComments.ts) holds it. */
interface CommentRow {
  id: string
  body: string
  page_id: string | null
  x: number | null
  y: number | null
  parent: string | null
  resolved: boolean
}

/** Input and answer of the headless render page (src/editor/headless): restated here, the e2e project does not compile src. */
export interface RenderInput {
  document: unknown
  page?: number | string
  multiplier?: number
  transparent?: boolean
  fonts?: unknown[]
}
export type RenderResponse =
  | { ok: true; png: string; width: number; height: number; pageId: string; pageIndex: number; placeholders: number; missingFonts: string[] }
  | { ok: false; error: { code: string; message: string } }

/** Shape of `window.__doory`, installed by the dev harness (src/editor/dev/HarnessApp.tsx). */
declare global {
  interface Window {
    /** The headless render page (render.html, src/editor/headless/main.ts). */
    __dooryRender?: (input: RenderInput) => Promise<RenderResponse>
    __dooryRenderReady?: boolean
    __doory?: {
      saves: SaveInput[]
      uploads: { name: string; size: number }[]
      accountRequests: string[]
      saveStates: SaveState[]
      failNextSave(kind: 'conflict' | 'error'): void
      getDocument(): DoryDocument
      isDirty(): boolean
      saveNow(): Promise<void>
      conflictChoices: string[]
      titles: string[]
      comments: {
        calls: string[]
        snapshot(): CommentRow[]
        failNext(call: 'list' | 'create' | 'resolve' | 'remove' | 'move' | 'viewer', error?: Error): void
        setLatency(ms: number): void
        remote: {
          add(input: { body: string; page_id?: string | null; x?: number | null; y?: number | null; parent?: string | null; author?: 'owner' | 'guest' }): CommentRow
          resolve(id: string, resolved: boolean): void
          remove(id: string): void
          move(id: string, to: { page_id: string; x: number; y: number }): void
        }
      }
    }
  }
}
