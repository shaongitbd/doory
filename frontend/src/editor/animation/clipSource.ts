/**
 * Where the frame renderer gets a clip's pictures from. The renderer knows the time it wants; a source knows how to
 * get there: the preview plays a hidden `<video>` along with the page clock, the exporter decodes the exact frame.
 */

/** What a source needs to know about the clip it plays. */
export interface ClipMedia {
  /** The clip's address (resolved, loadable). */
  url: string
  /** How fast it plays (1: its own speed). */
  speed: number
  /**
   * Clips with the same key show the same picture at every moment (one clip and its blurred background): they
   * share one source, so the file is decoded once.
   */
  share?: string
}

export interface ClipFrameSource {
  /**
   * Asks for the picture at `ms` of the source. `moving`: the clip is between its start and its end at this moment, so
   * a source that follows a running clock plays on (catching up when it drifts) rather than standing on that picture.
   */
  want(ms: number, moving: boolean): void
  /** Resolves when `frame()` shows the picture at `ms` (the exporter waits for each frame; the preview doesn't). */
  ready(ms: number): Promise<void>
  /** The picture to draw now, or null until the first one has arrived. */
  frame(): CanvasImageSource | null
  /** Changes whenever `frame()` shows another picture. */
  readonly version: number
  /** The page clock started or stopped, or changed speed (`rate` is the clock's own: the clip's speed comes on top). */
  setClock(playing: boolean, rate: number): void
  /** Lets go of decoders and playing elements while the renderer is off screen (it may be asked again later). */
  suspend(): void
  dispose(): void
}

/** Makes the source of one clip; `onFrame` is called when a new picture arrived on its own (a seek landed). */
export type ClipMediaFactory = (media: ClipMedia, onFrame: () => void) => ClipFrameSource

/**
 * Wraps a factory so that clips with the same `share` key get one source between them. Each clip still disposes
 * its own handle; the source goes when the last one does.
 */
export function sharedSources(factory: ClipMediaFactory): ClipMediaFactory {
  const shared = new Map<string, { source: ClipFrameSource; users: number }>()
  return (media, onFrame) => {
    const key = media.share
    if (!key) return factory(media, onFrame)
    let entry = shared.get(key)
    if (!entry) {
      entry = { source: factory(media, onFrame), users: 0 }
      shared.set(key, entry)
    }
    entry.users++
    const { source } = entry
    let released = false
    return {
      get version() {
        return source.version
      },
      want: (ms, moving) => source.want(ms, moving),
      ready: (ms) => source.ready(ms),
      frame: () => source.frame(),
      setClock: (playing, rate) => source.setClock(playing, rate),
      suspend: () => source.suspend(),
      dispose: () => {
        if (released) return
        released = true
        const current = shared.get(key)
        if (!current) return
        current.users--
        if (current.users <= 0) {
          shared.delete(key)
          current.source.dispose()
        }
      },
    }
  }
}
