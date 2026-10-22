import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBlankDocument } from '@/lib/document'
import type { AssetRef, EditorServices, VideoService, VideoUploadOptions } from '@/types/adapter'
import type { StockVideo, StockVideoPage, VideoInfo } from '@/types/api'
import { setupEditor } from '../animation/testing'
import { EditorProvider } from '../EditorProvider'
import type { EditorEngine } from '../engine/editor'
import { t } from '../strings'
import { VideosPanel } from './VideosPanel'

const INFO: VideoInfo = {
  enabled: true,
  max_upload_bytes: 200 * 1024 * 1024,
  max_duration_ms: 600_000,
  providers: [
    { name: 'pexels_video', label: 'Pexels', attribution: 'Videos provided by Pexels', url: 'https://www.pexels.com/' },
    { name: 'pixabay_video', label: 'Pixabay', attribution: 'Videos from Pixabay', url: 'https://pixabay.com/' },
  ],
  all: ['pexels_video', 'pixabay_video'],
  default: 'all',
}

const clipRef = (id: string, status: 'ready' | 'processing' | 'failed' = 'ready'): AssetRef => ({
  id,
  url: `/media/${id}.mp4`,
  thumbUrl: `/media/${id}.webp`,
  width: 1920,
  height: 1080,
  name: `${id}.mp4`,
  kind: 'video',
  video: { status, error: status === 'failed' ? 'The video could not be converted.' : '', posterUrl: `/media/${id}-poster.webp`, audioUrl: '', durationMs: 7000, fps: 30, filmstrip: null },
})

const stock = (id: string, provider = 'pexels_video'): StockVideo => ({
  id,
  provider,
  thumb_url: `https://images.pexels.com/${id}.jpg`,
  preview_url: `https://videos.pexels.com/${id}.mp4`,
  width: 1920,
  height: 1080,
  duration_ms: 12_000,
  author: 'Ada',
  author_url: '',
  source_url: '',
})

function fakeService(over: Partial<VideoService> = {}): VideoService {
  return {
    info: vi.fn(async () => INFO),
    list: vi.fn(async () => ({ count: 2, next: null, previous: null, results: [clipRef('mine'), clipRef('busy', 'processing')] })),
    get: vi.fn(async (id: string) => clipRef(id)),
    upload: vi.fn(async (file: File) => clipRef(file.name.replace(/\W/g, ''))),
    search: vi.fn(async (): Promise<StockVideoPage> => ({ configured: true, provider: 'all', total: 2, next_page: null, results: [stock('1'), stock('2', 'pixabay_video')] })),
    importVideo: vi.fn(async (video: StockVideo) => clipRef(`stock-${video.id}`)),
    ...over,
  }
}

async function open(service: VideoService | null) {
  const { engine } = await setupEditor({ doc: createBlankDocument(1080, 1920) })
  ;(engine.adapter.services as EditorServices).video = service
  const fromAsset = vi.spyOn(engine.videos, 'fromAsset').mockResolvedValue()
  /** Opens the tool (again); returns how to close it. */
  const mount = async (): Promise<() => void> => {
    let unmount: () => void = () => undefined
    await act(async () => {
      ;({ unmount } = render(
        <EditorProvider engine={engine} portalRoot={document.body}>
          <VideosPanel close={() => undefined} />
        </EditorProvider>,
      ))
    })
    return unmount
  }
  const close = await mount()
  return { engine, fromAsset, close, mount }
}

describe('Videos tool', () => {
  let engine: EditorEngine | null = null

  afterEach(() => {
    engine?.dispose()
    engine = null
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('asks a guest to sign up', async () => {
    ;({ engine } = await open(null))
    expect(screen.getByTestId('videos-gate')).toHaveTextContent(t.clips.off.title)
  })

  it('says so when the server takes no video', async () => {
    ;({ engine } = await open(fakeService({ info: vi.fn(async () => ({ ...INFO, enabled: false })) })))
    expect(await screen.findByTestId('videos-off')).toHaveTextContent(t.clips.off.server)
  })

  it('lists the person’s clips; a ready one is added, one being prepared is not', async () => {
    const service = fakeService()
    const opened = await open(service)
    engine = opened.engine
    const mine = await screen.findByRole('button', { name: t.clips.uploads.add('mine.mp4') })
    expect(mine).toHaveTextContent('0:07')
    const busy = screen.getByRole('button', { name: t.clips.uploads.add('busy.mp4') })
    expect(busy).toBeDisabled()
    expect(busy).toHaveTextContent(t.clips.uploads.processing)
    fireEvent.click(mine)
    expect(opened.fromAsset).toHaveBeenCalledWith(expect.objectContaining({ id: 'mine' }))
  })

  it('uploads a video and adds it at once when it is ready', async () => {
    const service = fakeService({ list: vi.fn(async () => ({ count: 0, next: null, previous: null, results: [] })) })
    const opened = await open(service)
    engine = opened.engine
    const input = screen.getByTestId('video-file-input') as HTMLInputElement
    const file = new File(['x'], 'beach.mov', { type: 'video/quicktime' })
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } })
    })
    await waitFor(() => expect(service.upload).toHaveBeenCalledWith(file, expect.objectContaining({ onProgress: expect.any(Function) })))
    await waitFor(() => expect(opened.fromAsset).toHaveBeenCalledWith(expect.objectContaining({ id: 'beachmov' })))
  })

  it('keeps an upload going when the tool closes, and shows it again when the tool opens', async () => {
    let progress: (fraction: number) => void = () => undefined
    let finish: (ref: AssetRef) => void = () => undefined
    const upload = vi.fn((_file: File, options?: VideoUploadOptions) => {
      progress = options?.onProgress ?? progress
      return new Promise<AssetRef>((resolve) => {
        finish = resolve
      })
    })
    const service = fakeService({ upload, list: vi.fn(async () => ({ count: 0, next: null, previous: null, results: [] })) })
    const opened = await open(service)
    engine = opened.engine
    await act(async () => {
      fireEvent.change(screen.getByTestId('video-file-input'), { target: { files: [new File(['x'], 'beach.mov', { type: 'video/quicktime' })] } })
    })
    await waitFor(() => expect(upload).toHaveBeenCalled())
    expect(upload.mock.calls[0][1]?.signal).toBeUndefined()
    act(() => progress(0.4))
    opened.close()
    await opened.mount()
    expect(screen.getByText(t.clips.uploads.uploading('beach.mov', 40))).toBeInTheDocument()
    await act(async () => finish(clipRef('beachmov')))
    await waitFor(() => expect(opened.fromAsset).toHaveBeenCalledWith(expect.objectContaining({ id: 'beachmov' })))
    expect(screen.queryByText(t.clips.uploads.uploading('beach.mov', 40))).toBeNull()
  })

  it('refuses a file that is not a video, or too large, without sending it', async () => {
    const service = fakeService({ info: vi.fn(async () => ({ ...INFO, max_upload_bytes: 4 })) })
    ;({ engine } = await open(service))
    const input = await screen.findByTestId('video-file-input')
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(['x'], 'notes.txt', { type: 'text/plain' })] } })
    })
    expect(screen.getByRole('alert')).toHaveTextContent(t.clips.uploads.notVideo('notes.txt'))
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(['too long'], 'big.mp4', { type: 'video/mp4' })] } })
    })
    expect(screen.getByRole('alert')).toHaveTextContent('big.mp4 is larger than')
    expect(service.upload).not.toHaveBeenCalled()
  })

  it('searches stock videos with filters, credits the providers and imports a pick', async () => {
    const service = fakeService()
    const opened = await open(service)
    engine = opened.engine
    fireEvent.click(await screen.findByTestId('video-tab-stock'))
    await screen.findAllByTestId('stock-video')
    expect(service.search).toHaveBeenLastCalledWith('nature', 1, expect.objectContaining({ provider: 'all' }))
    expect(screen.getByTestId('stock-video-attribution')).toHaveTextContent('Videos provided by Pexels · Videos from Pixabay')

    fireEvent.click(screen.getByRole('radio', { name: t.clips.stock.orientations.portrait }))
    await waitFor(() => expect(service.search).toHaveBeenLastCalledWith('nature', 1, expect.objectContaining({ orientation: 'portrait' })))

    fireEvent.click(screen.getAllByTestId('stock-video')[0])
    await waitFor(() => expect(opened.fromAsset).toHaveBeenCalledWith(expect.objectContaining({ id: 'stock-1' })))
  })

  it('plays a preview while the pointer rests on a stock video', async () => {
    ;({ engine } = await open(fakeService()))
    fireEvent.click(await screen.findByTestId('video-tab-stock'))
    const [first] = await screen.findAllByTestId('stock-video')
    expect(screen.queryByTestId('stock-video-preview')).toBeNull()
    fireEvent.pointerEnter(first)
    expect(screen.getByTestId('stock-video-preview')).toHaveAttribute('src', 'https://videos.pexels.com/1.mp4')
    fireEvent.pointerLeave(first)
    expect(screen.queryByTestId('stock-video-preview')).toBeNull()
  })

  it('plays no preview on focus when the system asks for reduced motion, still on the pointer', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), addEventListener: () => undefined, removeEventListener: () => undefined }))
    ;({ engine } = await open(fakeService()))
    fireEvent.click(await screen.findByTestId('video-tab-stock'))
    const [first] = await screen.findAllByTestId('stock-video')
    fireEvent.focus(first)
    expect(screen.queryByTestId('stock-video-preview')).toBeNull()
    fireEvent.pointerEnter(first)
    expect(screen.getByTestId('stock-video-preview')).toBeInTheDocument()
  })
})
