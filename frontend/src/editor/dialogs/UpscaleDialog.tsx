import { useEffect, useRef, useState } from 'react'
import { isApiError } from '@/lib/api'
import type { AiOption } from '@/types/api'
import { DEVICE_OPTION } from '../engine/bgRemoval'
import { UPSCALE_TASK } from '../engine/upscale'
import { fitsOutput, targetSize } from '../engine/upscale/types'
import { isUpscaleSupported, maxOutputPixels } from '../engine/upscale/support'
import { useEditor } from '../context'
import { t } from '../strings'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { Segmented } from '../ui/Segmented'
import { describeFailure } from './bgRemovalFailure'
import styles from './dialogs.module.css'

type Status = { kind: 'idle' } | { kind: 'running'; percent: number } | { kind: 'error'; message: string }

const SCALES = [
  { value: '2', label: '2×' },
  { value: '4', label: '4×' },
] as const

const DEVICE: AiOption = { id: DEVICE_OPTION, label: t.dialog.upscaleDevice, task: UPSCALE_TASK, kind: 'device', provider_name: '', owner: 'device', sends_offsite: false }

function optionHint(option: AiOption, supported: boolean): string {
  if (option.kind === 'device') return supported ? t.dialog.upscaleDeviceHint : t.errors.upscaleUnsupported
  if (option.owner === 'user') return t.bgRemoval.ownServerHint(option.provider_name)
  return option.sends_offsite ? t.bgRemoval.externalHint : t.bgRemoval.serverHint
}

/** What went wrong with a server option, in words. */
function serverFailure(error: unknown, option: AiOption): string {
  if (!isApiError(error)) return error instanceof Error && error.message ? error.message : t.errors.upscale
  const wait = error.retryAfter ? t.bgRemoval.wait(error.retryAfter) : null
  const code = error.code.replace(/^ai_/, '')
  if (code === 'quota') return t.dialog.upscaleQuota(wait)
  if (code === 'throttled' || error.isRateLimited) return t.dialog.upscaleThrottled(wait)
  const { message } = describeFailure(error, option)
  return message === t.bgRemoval.errors.generic ? t.errors.upscale : message
}

/**
 * Upscales the selected photo: on this device with the pure-code Lanczos resampler (the default), or, when the
 * site offers server options for the upscale task, with an AI model on a server. The last pick is remembered.
 */
export function UpscaleDialog() {
  const editor = useEditor()
  const ai = editor.adapter.services.ai
  const [source] = useState(() => editor.style.selectedImageSource())
  const [scaleId, setScaleId] = useState<'2' | '4'>('2')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [servers, setServers] = useState<AiOption[]>([])
  const [selected, setSelected] = useState<string>(DEVICE_OPTION)
  const controller = useRef<AbortController | null>(null)
  const cancelButton = useRef<HTMLButtonElement>(null)
  const supported = isUpscaleSupported()

  useEffect(() => () => controller.current?.abort(), [])

  // Server options, when the site has any: this device stays the default unless the user picked one before.
  useEffect(() => {
    if (!ai) return
    let live = true
    void ai
      .options(UPSCALE_TASK)
      .then((listed) => listed.models.filter((option) => option.kind === 'server'))
      .catch(() => [])
      .then((found) => {
        if (!live || found.length === 0) return
        setServers(found)
        const remembered = ai.remembered(UPSCALE_TASK)
        const pick = found.find((option) => option.id === remembered) ?? (supported ? null : found[0])
        if (pick) setSelected(pick.id)
      })
    return () => {
      live = false
    }
  }, [ai, supported])

  const options = [DEVICE, ...servers]
  const chosen = options.find((option) => option.id === selected) ?? DEVICE
  const onServer = chosen.kind === 'server'
  const usable = onServer || supported

  const scale = Number(scaleId)
  const target = source ? targetSize(source.width, source.height, scale) : null
  const tooLarge = target ? !fitsOutput(target, onServer ? undefined : maxOutputPixels()) : false
  const large = !onServer && target ? target.width * target.height > 24_000_000 : false

  const start = (): void => {
    if (!usable || !source || tooLarge || controller.current) return
    const run = new AbortController()
    controller.current = run
    if (servers.length > 0) ai?.remember(UPSCALE_TASK, chosen.id)
    // The Upscale button goes away while it runs: keep the keyboard on the dialog's Cancel.
    cancelButton.current?.focus()
    setStatus({ kind: 'running', percent: 0 })
    editor.style
      .upscale(onServer ? { scale, option: chosen.id } : { scale }, (percent) => {
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
        const message = onServer ? serverFailure(err, chosen) : err instanceof Error && err.message ? err.message : t.errors.upscale
        setStatus({ kind: 'error', message })
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
      width={servers.length > 0 ? 440 : 400}
      footer={
        <>
          <Button ref={cancelButton} onClick={close}>
            {t.dialog.cancel}
          </Button>
          {status.kind === 'running' ? null : (
            <Button variant="primary" disabled={!usable || !source || tooLarge} onClick={start}>
              {status.kind === 'error' ? t.dialog.upscaleRetry : t.dialog.upscaleButton}
            </Button>
          )}
        </>
      }
    >
      {!usable ? (
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
            {onServer ? t.dialog.upscaleServerWorking : t.dialog.upscaleWorking}
          </p>
          {onServer ? (
            <div role="progressbar" aria-label={t.dialog.upscaleTitle} className={`${styles.progress} ${styles.progressIndeterminate}`}>
              <div />
            </div>
          ) : (
            <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={status.percent} aria-label={t.dialog.upscaleTitle} className={styles.progress}>
              <div style={{ width: `${Math.max(4, status.percent)}%` }} />
            </div>
          )}
        </div>
      ) : (
        <div className={styles.stack}>
          {servers.length > 0 ? (
            <div role="radiogroup" aria-label={t.dialog.upscaleMethod} className={styles.modes}>
              {options.map((option) => (
                <label key={option.id} className={`${styles.mode} ${option.id === chosen.id ? styles.modeOn : ''}`}>
                  <input
                    type="radio"
                    name="upscale-option"
                    value={option.id}
                    checked={option.id === chosen.id}
                    disabled={option.kind === 'device' && !supported}
                    onChange={() => setSelected(option.id)}
                  />
                  <span>
                    <strong>{option.label}</strong>
                    <small>{optionHint(option, supported)}</small>
                  </span>
                </label>
              ))}
            </div>
          ) : null}
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
          <p className={styles.muted}>{onServer ? t.dialog.upscaleServerNote : t.dialog.upscaleNote}</p>
          {chosen.sends_offsite ? (
            <p className={styles.muted} data-testid="upscale-offsite">
              {ai?.offsiteNotice || t.bgRemoval.offsite}
            </p>
          ) : null}
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
