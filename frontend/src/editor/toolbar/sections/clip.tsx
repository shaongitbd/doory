/**
 * The contextual row for a selected video clip: play the page from here, trim, sound (mute, volume, fades), speed and
 * loop, then the picture tools that apply to a clip as to any picture (crop, frame, opacity). Every setting goes through
 * `editor.videos.update`; a slider drag is one undo step.
 */
import { Blend, Crop, Gauge, Pause, Play, Repeat, Replace, Scissors, SquareSplitHorizontal, Volume2, VolumeX } from 'lucide-react'
import { playbackOf, usePlaybackValue } from '../../animation/playback'
import { commands } from '../../commands'
import { previewLengthMs } from '../../animation/timelineMath'
import { Filmstrip } from '../../clips/Filmstrip'
import { MAX_FADE_MS, MIN_CLIP_MS, SPEEDS, clipLengthMs, readClip } from '../../clips/model'
import { formatClipTime } from '../../clips/strings'
import { useEditor, useEditorState, useSelection } from '../../context'
import { t } from '../../strings'
import { Segmented } from '../../ui/Segmented'
import { Slider } from '../../ui/Slider'
import { Switch } from '../../ui/Switch'
import { OpacityTool } from '../controls'
import { PopoverStack, PopoverTool, ToolButton } from '../parts'
import { AdjustPanel, FrameTool, SlidersIcon } from './image'
import ed from '../../chrome/ed.module.css'

const s = t.clips.toolbar
const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)} s`

export function ClipSection() {
  const editor = useEditor()
  const sel = useSelection()
  const object = sel.objects[0]
  const clip = object ? readClip(object) : null
  const id = typeof object?.id === 'string' ? object.id : undefined
  const page = useEditorState((st) => st.doc.pages.find((p) => p.id === st.activePageId))
  const playing = usePlaybackValue((st) => st.playing)
  if (!clip || !id) return null
  const fillsPlaceholder = object?.slot !== undefined
  const update = (patch: Parameters<typeof editor.videos.update>[1], key?: string, label?: string): void => {
    editor.videos.update(id, patch, label, key ? `clip:${key}:${id}` : undefined)
  }
  const playback = playbackOf(editor)
  const silent = !clip.audioSrc
  const speedMutes = clip.speed !== 1 && !silent && !clip.muted
  return (
    <>
      <ToolButton label={playing ? s.pause : s.play} testId="ed-clip-play" onClick={() => playback.toggle(page ? previewLengthMs(page) : 0)}>
        {playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
      </ToolButton>
      <PopoverTool label={s.trimTitle} trigger={<Scissors size={18} aria-hidden="true" />} width={312} testId="ed-clip-trim">
        <PopoverStack width={288}>
          <Filmstrip strip={clip.filmstrip} fromMs={clip.trimStartMs} toMs={clip.trimEndMs} tiles={8} style={{ height: 40, borderRadius: 6 }} />
          <p className={ed.propLabel} role="status">
            {s.trimRange(formatClipTime(clip.trimStartMs), formatClipTime(clip.trimEndMs), seconds(clip.trimEndMs - clip.trimStartMs))}
          </p>
          <Slider
            label={s.trimStart}
            value={clip.trimStartMs}
            min={0}
            max={Math.max(0, clip.trimEndMs - MIN_CLIP_MS)}
            step={100}
            display={seconds(clip.trimStartMs)}
            onChange={(v) => update({ trimStartMs: v }, 'trim', t.clips.history.trim)}
          />
          <Slider
            label={s.trimEnd}
            value={clip.trimEndMs}
            min={Math.min(clip.durationMs, clip.trimStartMs + MIN_CLIP_MS)}
            max={clip.durationMs}
            step={100}
            display={seconds(clip.trimEndMs)}
            onChange={(v) => update({ trimEndMs: v }, 'trim', t.clips.history.trim)}
          />
          <Slider label={s.startAt} value={clip.startMs} min={0} max={60_000} step={100} display={seconds(clip.startMs)} onChange={(v) => update({ startMs: v }, 'start', t.clips.history.move)} />
        </PopoverStack>
      </PopoverTool>
      <ToolButton label={s.split} shortcut="S" testId="ed-clip-split" onClick={() => void commands.get('video.split')?.run(editor)}>
        <SquareSplitHorizontal size={18} aria-hidden="true" />
      </ToolButton>
      <ToolButton label={silent ? s.silent : clip.muted ? s.unmute : s.mute} pressed={clip.muted} disabled={silent} testId="ed-clip-mute" onClick={() => update({ muted: !clip.muted })}>
        {clip.muted || silent ? <VolumeX size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}
      </ToolButton>
      {silent ? null : (
        <PopoverTool label={s.volume} trigger={<span className={ed.textButton}>{Math.round(clip.volume * 100)}%</span>} width={280} testId="ed-clip-volume">
          <PopoverStack width={256}>
            <Slider label={s.volume} value={Math.round(clip.volume * 100)} min={0} max={100} display={`${Math.round(clip.volume * 100)}%`} onChange={(v) => update({ volume: v / 100 }, 'volume')} />
            <Slider label={s.fadeIn} value={clip.fadeInMs} min={0} max={Math.min(MAX_FADE_MS, clipLengthMs(clip))} step={100} display={seconds(clip.fadeInMs)} onChange={(v) => update({ fadeInMs: v }, 'fade-in')} />
            <Slider label={s.fadeOut} value={clip.fadeOutMs} min={0} max={Math.min(MAX_FADE_MS, clipLengthMs(clip))} step={100} display={seconds(clip.fadeOutMs)} onChange={(v) => update({ fadeOutMs: v }, 'fade-out')} />
          </PopoverStack>
        </PopoverTool>
      )}
      <PopoverTool label={s.speed} trigger={<Gauge size={18} aria-hidden="true" />} pressed={clip.speed !== 1} width={280} testId="ed-clip-speed">
        <PopoverStack width={256}>
          <Segmented<string>
            label={s.speed}
            value={String(clip.speed)}
            onChange={(v) => update({ speed: Number(v) })}
            options={SPEEDS.map((speed) => ({ value: String(speed), label: s.speedValue(speed) }))}
          />
          {speedMutes ? <p className={ed.propLabel}>{s.speedMutes}</p> : null}
          <Switch label={s.loop} checked={clip.loop} onChange={(loop) => update({ loop })} />
        </PopoverStack>
      </PopoverTool>
      <ToolButton label={s.loop} pressed={clip.loop} testId="ed-clip-loop" onClick={() => update({ loop: !clip.loop })}>
        <Repeat size={18} aria-hidden="true" />
      </ToolButton>
      <ToolButton label={s.replace} testId="ed-clip-replace" onClick={() => void editor.videos.startReplace(id)}>
        <Replace size={18} aria-hidden="true" />
      </ToolButton>
      {clip.backdropOf || page?.objects.some((o) => o.videoBackdropOf === id) ? null : (
        <ToolButton label={s.blurredBackgroundHint} testId="ed-clip-backdrop" onClick={() => void editor.videos.blurredBackground(id)}>
          <Blend size={18} aria-hidden="true" />
        </ToolButton>
      )}
      {fillsPlaceholder ? null : (
        <ToolButton label={t.toolbar.crop} shortcut="Enter" testId="ed-crop" onClick={() => void editor.crop.start()}>
          <Crop size={18} aria-hidden="true" />
        </ToolButton>
      )}
      <PopoverTool label={t.toolbar.filters} trigger={<SlidersIcon />} width={312} testId="ed-adjust">
        <AdjustPanel />
      </PopoverTool>
      {fillsPlaceholder ? null : <FrameTool />}
      <OpacityTool />
    </>
  )
}
