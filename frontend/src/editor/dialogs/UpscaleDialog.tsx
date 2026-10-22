import { useEffect, useRef, useState } from 'react'
import { fitsOutput, targetSize } from '../engine/upscale/types'
import { isUpscaleSupported, maxOutputPixels } from '../engine/upscale/support'
import { useEditor } from '../context'
import { t } from '../strings'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { Segmented } from '../ui/Segmented'
import styles from './dialogs.module.css'

type Status = { kind: 'idle' } | { kind: 'running'; percent: number } | { kind: 'error'; message: string }

const SCALES = [
  { value: '2', label: '2×' },
  { value: '4', label: '4×' },
] as const

/** Upscales the selected photo locally with the pure-code Lanczos resampler. */
export function UpscaleDialog() {
  const editor = useEditor()
  const [source] = useState(() => editor.style.selectedImageSource())
  const [scaleId, setScaleId] = useState<'2' | '4'>('2')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const controller = useRef<AbortController | null>(null)
  const cancelButton = useRef<HTMLButtonElement>(null)
  const supported = isUpscaleSupported()

  useEffect(() => () => controller.current?.abort(), [])

  const scale = Number(scaleId)
  const target = source ? targetSize(source.width, source.height, scale) : null
  const tooLarge = target ? !fitsOutput(target, maxOutputPixels()) : false
  const large = target ? target.width * target.height > 24_000_000 : false

  const start = (): void => {
    if (!supported || !source || tooLarge || controller.current) return
    const run = new AbortController()
    controller.current = run
    // The Upscale button goes away while it runs: keep the keyboard on the dialog's Cancel.
    cancelButton.current?.focus()
    setStatus({ kind: 'running', percent: 0 })
    editor.style
      .upscale({ scale }, (percent) => {
        if (!run.signal.aborted) setStatus({ kind: 'running', percent })
      }, run.signal)
      .then((applied) => {
        if (run.signal.aborted) return
        controller.current = null
        editor.closeDialog()
        editor.toast(applied ? t.dialog.upscaleDone : t.dialog.upscaleNotApplied, applied ? 'success' : 'info')
      })
      .catch((err: unknown) => {
        if (run.signal.aborted) return
        controller.current = null
        setStatus({ kind: 'error', message: err instanceof Error && err.message ? err.message : t.errors.upscale })
      })
  }

  const close = (): void => {
    controller.current?.abort()
    editor.closeDialog()
  }

  return (
    <Dialog
      title={t.dialog.upscaleTitle}
      onClose={close}
      width={400}
      footer={
        <>
          <Button ref={cancelButton} onClick={close}>
            {t.dialog.cancel}
          </Button>
          {status.kind === 'running' ? null : (
            <Button variant="primary" disabled={!supported || !source || tooLarge} onClick={start}>
              {status.kind === 'error' ? t.dialog.upscaleRetry : t.dialog.upscaleButton}
            </Button>
          )}
        </>
      }
    >
      {!supported ? (
        <p role="alert" className={styles.error}>
          {t.errors.upscaleUnsupported}
        </p>
      ) : !source ? (
        <p role="alert" className={styles.error}>
          {t.errors.upscale}
        </p>
      ) : status.kind === 'running' ? (
        <div className={styles.stack}>
          <p role="status" className={styles.muted}>
            {t.dialog.upscaleWorking}
          </p>
          <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={status.percent} aria-label={t.dialog.upscaleTitle} className={styles.progress}>
            <div style={{ width: `${Math.max(4, status.percent)}%` }} />
          </div>
        </div>
      ) : (
        <div className={styles.stack}>
          <p className={styles.muted}>
            {t.dialog.upscaleSource}: {source.width} × {source.height} px
          </p>
          {source.crop ? (
            <p className={styles.muted}>
              {t.dialog.upscaleCrop}: {Math.round(source.crop.width)} × {Math.round(source.crop.height)} px
            </p>
          ) : null}
          <Segmented label={t.dialog.upscaleScale} value={scaleId} options={SCALES} onChange={(value) => setScaleId(value)} />
          <p className={styles.muted}>
            {t.dialog.upscaleTarget}: {target ? `${target.width} × ${target.height} px` : ''}
          </p>
          {large ? <p className={styles.muted}>{t.dialog.upscaleLarge}</p> : null}
          {tooLarge ? (
            <p role="alert" className={styles.error}>
              {t.dialog.upscaleTooLarge}
            </p>
          ) : null}
          <p className={styles.muted}>{t.dialog.upscaleNote}</p>
          {status.kind === 'error' ? (
            <p role="alert" className={styles.error}>
              {status.message}
            </p>
          ) : null}
        </div>
      )}
    </Dialog>
  )
}
