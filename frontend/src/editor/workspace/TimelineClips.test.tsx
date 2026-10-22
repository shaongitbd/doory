import { act, fireEvent, render, screen } from '@testing-library/react'
import { FabricImage } from 'fabric'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DocObject } from '@/types/document'
import { setupEditor } from '../animation/testing'
import { EditorProvider } from '../EditorProvider'
import type { EditorEngine } from '../engine/editor'
import { installImageStub } from '../test/imageStub'
import { ClipsSection } from './TimelineClips'

const clip: DocObject = { id: 'clip', type: 'image', src: '/media/poster.webp', left: 10, top: 10, width: 160, height: 90, videoSrc: '/media/c.mp4', videoDurationMs: 4000, videoTrimEndMs: 4000 }

describe('the clips of the timeline', () => {
  let restoreImages: () => void
  let engine: EditorEngine | null = null
  beforeAll(() => {
    restoreImages = installImageStub({ width: 160, height: 90 })
  })
  afterAll(() => restoreImages())
  beforeEach(() => {
    vi.spyOn(FabricImage.prototype, '_render').mockImplementation(() => undefined) // jsdom has no pixels to draw
  })
  afterEach(async () => {
    // Let Fabric's scheduled repaint run while the drawing is still stubbed.
    await new Promise((resolve) => requestAnimationFrame(resolve))
    engine?.dispose()
    engine = null
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('selects a clip with Enter or Space on its bar, as a button does', async () => {
    ;({ engine } = await setupEditor({ objects: [clip, { id: 'other', type: 'rect', left: 0, top: 0, width: 10, height: 10 }] }))
    const pageId = engine.state.activePageId
    await act(async () => {
      render(
        <EditorProvider engine={engine!} portalRoot={document.body}>
          <ClipsSection pageId={pageId} pxPerMs={0.1} contentWidth={800} lengthMs={8000} readOnly={false} />
        </EditorProvider>,
      )
    })
    const bar = screen.getByTestId('tl-clip-bar-clip')
    expect(bar).toHaveAttribute('role', 'button')
    act(() => engine!.select(['other']))
    act(() => void fireEvent.keyDown(bar, { key: 'Enter' }))
    expect(engine.state.selection.ids).toEqual(['clip'])
    act(() => engine!.select(['other']))
    act(() => void fireEvent.keyDown(bar, { key: ' ' }))
    expect(engine.state.selection.ids).toEqual(['clip'])
  })
})
