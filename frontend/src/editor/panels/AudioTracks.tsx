/**
 * The tracks of the design as a list of cards. A card shows the name, where the track plays and a mute button; opened,
 * it has every setting: volume, trim (with a waveform), start, fades, loop, ducking, the page it plays on, duplicate and
 * delete. All changes are `editor.audio.*` commands, so each is undoable and reaches collaborators.
 */
import { ChevronDown, Copy, FileAudio, Mic, Music, Pause, Play, Sparkles, Trash2, Volume2, VolumeX } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { useLocale } from '@/i18n/useLocale'
import type { AudioTrack, AudioTrackKind } from '@/types/document'
import { useEditor, useEditorState } from '../context'
import { formatSeconds } from '../animation/timelineMath'
import { scopeLabel } from '../audio/labels'
import { MAX_NAME_LENGTH, MAX_TIME_MS, ducks, orphanedTracks, readTracks, trimmedLengthMs } from '../audio/model'
import { audioRuntime, usePreview } from '../audio/runtime'
import { t } from '../strings'
import { Button, IconButton } from '../ui/Button'
import { NumberField } from '../ui/NumberField'
import { Select } from '../ui/Select'
import { Slider } from '../ui/Slider'
import { Switch } from '../ui/Switch'
import { AudioTrimmer } from './AudioTrimmer'
import styles from './Audio.module.css'

const KIND_ICON: Record<AudioTrackKind, typeof Music> = { music: Music, voiceover: Mic, sfx: Sparkles, upload: FileAudio }
const MAX_FADE_UI_MS = 10_000

interface PageLabel {
  id: string
  label: string
}

function TrackCard({ track, pages, open, readOnly, onToggle }: { track: AudioTrack; pages: readonly PageLabel[]; open: boolean; readOnly: boolean; onToggle(): void }) {
  const editor = useEditor()
  const { previewer } = audioRuntime(editor)
  const preview = usePreview()
  const bodyId = useId()
  const Icon = KIND_ICON[track.kind]
  const key = `track:${track.id}`
  const playing = preview.key === key && preview.status === 'playing'
  const gone = track.scope.type === 'page' && !pages.some((p) => p.id === (track.scope as { pageId: string }).pageId)
  const source = track.durationMs ?? track.trimEndMs
  const name = track.name || t.audio.tracks.kinds[track.kind]

  return (
    <li className={styles.card} data-open={open || undefined} data-muted={track.muted || undefined} data-testid={`audio-track-${track.id}`} data-kind={track.kind}>
      <div className={styles.cardHead}>
        <span className={styles.kindIcon} data-kind={track.kind} aria-hidden="true">
          <Icon size={16} />
        </span>
        <button type="button" className={styles.cardTitle} aria-expanded={open} aria-controls={bodyId} title={open ? t.audio.tracks.collapse(name) : t.audio.tracks.expand(name)} onClick={onToggle} data-testid="audio-track-toggle">
          <span className={styles.cardName}>{name}</span>
          <span className={styles.cardMeta}>
            {t.audio.tracks.kinds[track.kind]} · <span data-gone={gone || undefined}>{scopeLabel(track, pages.map((p) => p.id))}</span> · {formatSeconds(trimmedLengthMs(track))}
            {track.credit?.required ? (
              <>
                {' · '}
                <span className={styles.creditFlag} title={t.audio.credits.neededHint(track.credit.license)} data-testid="audio-track-credit">
                  {t.audio.credits.needed}
                </span>
              </>
            ) : null}
          </span>
        </button>
        <IconButton
          label={playing ? t.audio.tracks.pause(name) : t.audio.tracks.play(name)}
          size="sm"
          pressed={playing}
          data-testid="audio-track-play"
          onClick={() =>
            void previewer.toggle(key, () => editor.assets.resolve(track.src), { durationMs: source, range: { fromMs: track.trimStartMs, toMs: track.trimEndMs } })
          }
        >
          {playing ? <Pause size={15} /> : <Play size={15} />}
        </IconButton>
        {readOnly ? null : (
          <IconButton label={track.muted ? t.audio.tracks.unmute(name) : t.audio.tracks.mute(name)} size="sm" data-testid="audio-track-mute" onClick={() => editor.audio.setMuted(track.id, !track.muted)}>
            {track.muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </IconButton>
        )}
        <IconButton label={open ? t.audio.tracks.collapse(name) : t.audio.tracks.expand(name)} size="sm" tooltip={false} aria-expanded={open} aria-controls={bodyId} className={styles.chevron} data-open={open || undefined} onClick={onToggle}>
          <ChevronDown size={16} />
        </IconButton>
      </div>
      {open ? (
        <div id={bodyId} className={styles.cardBody} data-testid="audio-track-body">
          {gone ? (
            <p className={styles.warn} role="status">
              {t.audio.tracks.pageGoneHint}
            </p>
          ) : null}
          <TrackSettings track={track} pages={pages} readOnly={readOnly} source={source} gone={gone} />
        </div>
      ) : null}
    </li>
  )
}

function TrackSettings({ track, pages, readOnly, source, gone }: { track: AudioTrack; pages: readonly PageLabel[]; readOnly: boolean; source: number; gone: boolean }) {
  const editor = useEditor()
  const nameId = useId()
  const scopeId = useId()
  const [draft, setDraft] = useState<string | null>(null)
  const api = editor.audio
  const label = track.name || t.audio.tracks.kinds[track.kind]
  const history = t.audio.history

  const commitName = (): void => {
    if (draft !== null && draft.trim() !== track.name) api.update(track.id, { name: draft }, history.rename)
    setDraft(null)
  }
  const fadeMax = Math.max(MAX_FADE_UI_MS, track.fadeInMs, track.fadeOutMs)
  const scopeValue = track.scope.type === 'design' ? 'design' : track.scope.pageId

  return (
    <div className={styles.settings}>
      <div className={styles.field}>
        <label htmlFor={nameId} className={styles.fieldLabel}>
          {t.audio.tracks.name}
        </label>
        <input
          id={nameId}
          className={styles.input}
          value={draft ?? track.name}
          maxLength={MAX_NAME_LENGTH}
          readOnly={readOnly}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') setDraft(null)
          }}
          data-testid="audio-track-name"
        />
      </div>
      <fieldset className={styles.group} disabled={readOnly}>
        <Slider label={t.audio.tracks.volume} value={Math.round(track.volume * 100)} min={0} max={100} step={1} display={t.audio.tracks.volumeValue(Math.round(track.volume * 100))} onChange={(v) => api.setVolume(track.id, v / 100)} />
        <div className={styles.trimBlock}>
          <span className={styles.fieldLabel}>{t.audio.tracks.trim}</span>
          <AudioTrimmer track={track} readOnly={readOnly} sourceMs={source} />
          {readOnly ? null : <p className={styles.hint}>{t.audio.tracks.trimHint}</p>}
        </div>
        <div className={styles.twoUp}>
          <Slider
            label={t.audio.tracks.fadeIn}
            value={track.fadeInMs}
            min={0}
            max={fadeMax}
            step={100}
            display={t.audio.tracks.seconds((track.fadeInMs / 1000).toFixed(1))}
            onChange={(v) => api.update(track.id, { fadeInMs: v }, history.fades, `audio-fade-in:${track.id}`)}
          />
          <Slider
            label={t.audio.tracks.fadeOut}
            value={track.fadeOutMs}
            min={0}
            max={fadeMax}
            step={100}
            display={t.audio.tracks.seconds((track.fadeOutMs / 1000).toFixed(1))}
            onChange={(v) => api.update(track.id, { fadeOutMs: v }, history.fades, `audio-fade-out:${track.id}`)}
          />
        </div>
        <NumberField
          label={t.audio.tracks.start}
          showLabel
          value={track.startMs / 1000}
          min={0}
          max={MAX_TIME_MS / 1000}
          step={0.1}
          decimals={1}
          suffix="s"
          hint={t.audio.tracks.startHint}
          scrub={false}
          onChange={(sec) => api.update(track.id, { startMs: Math.round(sec * 1000) }, history.move, `audio-start:${track.id}`)}
        />
        <div className={styles.field}>
          <label htmlFor={scopeId} className={styles.fieldLabel}>
            {t.audio.tracks.scopeLabel}
          </label>
          <Select
            id={scopeId}
            aria-label={t.audio.tracks.scopeLabel}
            value={gone ? 'gone' : scopeValue}
            data-testid="audio-track-scope"
            onChange={(e) => api.setScope(track.id, e.target.value === 'design' ? { type: 'design' } : { type: 'page', pageId: e.target.value })}
          >
            <option value="design">{t.audio.tracks.scopeOptionDesign}</option>
            {pages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
            {gone ? (
              <option value="gone" disabled>
                {t.audio.tracks.scopes.gone}
              </option>
            ) : null}
          </Select>
        </div>
        <Switch label={t.audio.tracks.loop} hint={t.audio.tracks.loopHint} checked={track.loop} onChange={(loop) => api.update(track.id, { loop }, t.audio.history.loop)} />
        {track.kind === 'voiceover' ? null : (
          <Switch label={t.audio.tracks.duck} hint={t.audio.tracks.duckHint} checked={ducks(track)} onChange={(on) => api.update(track.id, { duckUnderVoiceover: on }, t.audio.history.ducking)} />
        )}
      </fieldset>
      {readOnly ? null : (
        <div className={styles.cardActions}>
          {gone ? (
            <Button size="sm" variant="soft" onClick={() => api.setScope(track.id, { type: 'design' })} data-testid="audio-track-to-design">
              {t.audio.tracks.moveToDesign}
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" icon={<Copy size={14} aria-hidden="true" />} aria-label={t.audio.tracks.duplicate(label)} onClick={() => api.duplicate(track.id)} data-testid="audio-track-duplicate">
            {t.audio.tracks.duplicateAction}
          </Button>
          <Button size="sm" variant="danger" icon={<Trash2 size={14} aria-hidden="true" />} aria-label={t.audio.tracks.remove(label)} onClick={() => api.remove(track.id)} data-testid="audio-track-delete">
            {t.audio.tracks.removeAction}
          </Button>
        </div>
      )}
    </div>
  )
}

/** "In this design": the tracks, or a hint when there are none. */
export function AudioTracks({ readOnly }: { readOnly: boolean }) {
  useLocale()
  const doc = useEditorState((s) => s.doc)
  const [openId, setOpenId] = useState<string | null>(null)
  const tracks = readTracks(doc)
  const pages: PageLabel[] = doc.pages.map((p, i) => ({ id: p.id, label: t.audio.tracks.pageOption(i + 1, p.name) }))
  const orphans = useMemo(() => orphanedTracks(tracks, new Set(doc.pages.map((p) => p.id))).length, [tracks, doc.pages])
  const editor = useEditor()

  if (tracks.length === 0) {
    return (
      <p className={styles.empty} data-testid="audio-tracks-empty">
        {readOnly ? t.audio.tracks.emptyReadOnly : t.audio.tracks.empty}
      </p>
    )
  }
  return (
    <section className={styles.section} aria-label={t.audio.tracks.list} data-testid="audio-tracks">
      <header className={styles.sectionHead}>
        <h3 className={styles.sectionTitle}>{t.audio.tracks.heading}</h3>
        <span className={styles.count}>{t.audio.tracks.count(tracks.length)}</span>
        {orphans > 0 && !readOnly ? (
          <Button size="sm" variant="ghost" onClick={() => editor.audio.removeOrphans()} data-testid="audio-clean">
            {t.audio.tracks.orphans(orphans)}
          </Button>
        ) : null}
      </header>
      <ul className={styles.cards}>
        {tracks.map((track) => (
          <TrackCard key={track.id} track={track} pages={pages} open={openId === track.id} readOnly={readOnly} onToggle={() => setOpenId((cur) => (cur === track.id ? null : track.id))} />
        ))}
      </ul>
    </section>
  )
}
