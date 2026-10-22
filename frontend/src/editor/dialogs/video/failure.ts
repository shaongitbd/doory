import { VideoExportError, type VideoErrorCode, isAbort } from '../../engine/export/video/errors'
import { t } from '../../strings'

export interface VideoFailure {
  code: VideoErrorCode
  message: string
  hint: string
  /** What the browser said, for the person who files a bug. */
  detail: string | null
  /** Trying the same thing again can work (a failure in a codec or in memory); the others need a change first. */
  retryable: boolean
}

const RETRYABLE: ReadonlySet<VideoErrorCode> = new Set(['encoder', 'render', 'memory', 'clip'])

/** The words for what a video export threw; `null` for a cancellation, which needs none. */
export function describeVideoFailure(error: unknown): VideoFailure | null {
  if (isAbort(error)) return null
  const p = t.video.problems
  const code: VideoErrorCode = error instanceof VideoExportError ? error.code : 'render'
  return {
    code,
    message: p[code],
    hint: p[`${code}-hint`],
    detail: error instanceof VideoExportError ? (error.detail ?? null) : error instanceof Error ? error.message : null,
    retryable: RETRYABLE.has(code),
  }
}
