import { FORMAT_RULES, PAGE_SECONDS_RANGE, type FitMode, type Resolution, type VideoOptions, type VideoQuality, VIDEO_QUALITIES, clampPageSeconds } from '../../engine/export/video/options'
import type { Size } from '../../engine/export/video/geometry'
import { t } from '../../strings'
import { NumberField } from '../../ui/NumberField'
import { Segmented } from '../../ui/Segmented'
import { Switch } from '../../ui/Switch'
import { LOOP_COUNTS, type LoopChoice, loopChoiceOf } from './videoSettings'
import styles from './video.module.css'

interface VideoFormProps {
  options: VideoOptions
  onChange: (patch: Partial<VideoOptions>) => void
  /** The frame the video will have. */
  frame: Size
  /** The design has an audible track. */
  hasSound: boolean
  /** The browser can encode sound for this format. */
  canEncodeSound: boolean
  /** The chosen pages are not all the shape of the first. */
  mixedShapes: boolean
}

/** Seconds a page is given when the person switches to "the same for all" (the time a page without one gets). */
const DEFAULT_PAGE_SECONDS = 5

const resolutionLabel = (r: Resolution): string => t.video.sizeOptions[r]

/** The settings of the file: size, frame rate, quality, the shape of pages, time per page, sound, and the GIF's own. */
export function VideoForm({ options, onChange, frame, hasSound, canEncodeSound, mixedShapes }: VideoFormProps) {
  const rules = FORMAT_RULES[options.format]
  const gif = options.format === 'gif'
  const p = t.video
  return (
    <>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>{p.size}</span>
        <div className={styles.row}>
          <Segmented
            className={styles.segments}
            label={p.size}
            value={String(options.resolution)}
            onChange={(v) => onChange({ resolution: rules.resolutions.find((r) => String(r) === v) ?? options.resolution })}
            options={rules.resolutions.map((r) => ({ value: String(r), label: resolutionLabel(r) }))}
          />
          <span className={styles.readout} data-testid="video-size">
            {p.sizeReadout(frame.width, frame.height)}
          </span>
        </div>
      </div>

      <div className={styles.pair}>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>{p.fps}</span>
          <Segmented className={styles.segments} label={p.fps} value={String(options.fps)} onChange={(v) => onChange({ fps: Number(v) })} options={rules.fps.map((f) => ({ value: String(f), label: p.fpsOption(f) }))} />
        </div>

        {gif ? null : (
          <div className={styles.field}>
            <span className={styles.fieldLabel}>{p.quality}</span>
            <Segmented
              className={styles.segments}
              label={p.quality}
              value={options.quality}
              onChange={(v: VideoQuality) => onChange({ quality: v })}
              options={VIDEO_QUALITIES.map((q) => ({ value: q, label: p.qualityOptions[q] }))}
            />
          </div>
        )}
      </div>

      {mixedShapes ? (
        <div className={styles.field}>
          <span className={styles.fieldLabel}>{p.fit}</span>
          <Segmented className={styles.segments} label={p.fit} value={options.fit} onChange={(v: FitMode) => onChange({ fit: v })} options={(['fit', 'blur', 'fill'] as const).map((m) => ({ value: m, label: p.fitOptions[m] }))} />
          <p className={styles.hint}>{p.fitHint}</p>
        </div>
      ) : null}

      <div className={styles.field}>
        <span className={styles.fieldLabel}>{p.pageTime}</span>
        <div className={styles.row}>
          <Segmented
            className={styles.segments}
            label={p.pageTime}
            value={options.pageSeconds === null ? 'own' : 'same'}
            onChange={(v) => onChange({ pageSeconds: v === 'own' ? null : (options.pageSeconds ?? DEFAULT_PAGE_SECONDS) })}
            options={[
              { value: 'own', label: p.pageTimeOptions.own },
              { value: 'same', label: p.pageTimeOptions.same },
            ]}
          />
          {options.pageSeconds === null ? null : (
            <NumberField label={p.pageSeconds} value={options.pageSeconds} min={PAGE_SECONDS_RANGE.min} max={PAGE_SECONDS_RANGE.max} step={1} suffix="s" scrub={false} width={96} onChange={(v) => onChange({ pageSeconds: clampPageSeconds(v) })} />
          )}
        </div>
        <p className={styles.hint}>{p.pageTimeHint}</p>
      </div>

      {gif ? (
        <>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>{p.loop}</span>
            <Segmented
              className={styles.segments}
              label={p.loop}
              value={loopChoiceOf(options.loops)}
              onChange={(v: LoopChoice) => onChange({ loops: LOOP_COUNTS[v] })}
              options={(['forever', 'once', 'three'] as const).map((c) => ({ value: c, label: p.loopOptions[c] }))}
            />
          </div>
          <Switch label={p.dither} hint={p.ditherHint} checked={options.dither} onChange={(dither) => onChange({ dither })} />
        </>
      ) : hasSound && canEncodeSound ? (
        <Switch label={p.sound} hint={p.soundHint} checked={options.audio} onChange={(audio) => onChange({ audio })} />
      ) : hasSound ? null : (
        <p className={styles.hint} data-testid="video-no-sound">
          {p.soundNone}
        </p>
      )}
    </>
  )
}
