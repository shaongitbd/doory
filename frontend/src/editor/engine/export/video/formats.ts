/**
 * Registers MP4, WebM and GIF with the export registry, so they appear in the Download dialog's format list and work
 * through `runExport` like every other format. Nothing heavy is imported here: the pipeline, the muxers and the GIF
 * encoder load (with `import()`) when a file is actually made.
 */
import { writableMetadata } from '@/i18n/metadata'
import { t } from '../../../strings'
import type { EditorEngine } from '../../editor'
import { pageSize } from '../../docOps'
import { type ExportContext, type ExportFile, exportFilename, registerExportFormat } from '../registry'
import { type VideoFormat, defaultVideoOptions } from './options'

/** What the pipeline needs of the editor: how pictures and fonts load, and how the sound files are read. */
export function hostOf(engine: EditorEngine): { loadContext: EditorEngine['loadContext']; loadSound: EditorEngine['audio']['sources']['load'] } {
  return { loadContext: engine.loadContext, loadSound: engine.audio.sources.load }
}

async function runVideo(format: VideoFormat, ctx: ExportContext): Promise<ExportFile[]> {
  const { runVideoExport } = await import('./pipeline')
  const options = { ...(ctx.options.video ?? defaultVideoOptions(format)), format }
  const result = await runVideoExport({
    host: hostOf(ctx.engine),
    document: ctx.document,
    pages: ctx.pages,
    options,
    title: ctx.title,
    signal: ctx.signal,
    onProgress: (progress) => ctx.onProgress(progress.fraction, 'rendering'),
  })
  const extension = result.filename.slice(result.filename.lastIndexOf('.') + 1)
  return [{ blob: result.blob, filename: exportFilename(ctx, result.filename, extension, pageSize(ctx.document, ctx.pages[0].page), null) }]
}

export function registerVideoExportFormats(): void {
  registerExportFormat(writableMetadata({ id: 'mp4', label: 'MP4', get description() { return t.exportFormats.mp4 }, extension: 'mp4', mime: 'video/mp4', order: 50, controls: { video: true }, run: (ctx) => runVideo('mp4', ctx) }))
  registerExportFormat(writableMetadata({ id: 'webm', label: 'WebM', get description() { return t.exportFormats.webm }, extension: 'webm', mime: 'video/webm', order: 51, controls: { video: true }, run: (ctx) => runVideo('webm', ctx) }))
  registerExportFormat(writableMetadata({ id: 'gif', label: 'GIF', get description() { return t.exportFormats.gif }, extension: 'gif', mime: 'image/gif', order: 52, controls: { video: true }, run: (ctx) => runVideo('gif', ctx) }))
}

registerVideoExportFormats()
