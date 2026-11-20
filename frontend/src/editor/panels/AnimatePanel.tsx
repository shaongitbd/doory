/**
 * The Animate panel (a docked sidebar): with elements selected, a grid of enter / exit / emphasis presets with live
 * previews and the settings of the chosen one; for the page, a style that animates every element one after another
 * and the transition that brings the page in. Everything goes through `editor.animation` and `editor.pages`, so each
 * change is one undo step (a slider drag included) and reaches collaborators as the properties it is.
 */
import { Sparkles, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useLocale } from '@/i18n/useLocale'
import type { Anim, ObjectAnimation, PageTransition } from '@/types/document'
import { useEditor, useEditorState, useSelection } from '../context'
import { presetLabel } from '../animation/labels'
import { type AnimSlot, SLOTS, TRANSITION_RANGE } from '../animation/model'
import { newTransition, patchTransition, readAnimation } from '../animation/ops'
import { PAGE_STYLES } from '../animation/pageStyles'
import { type PresetDefaults, emphasisPresets, inOutPresets, transitionPresets } from '../animation/presets'
import type { AnimDirection } from '@/types/document'
import { EASINGS } from '../animation/easing'
import { t } from '../strings'
import { Button } from '../ui/Button'
import { NumberField } from '../ui/NumberField'
import { Segmented } from '../ui/Segmented'
import { Select } from '../ui/Select'
import { AnimateSettings } from './AnimateSettings'
import { AnimateThumb } from './AnimateThumb'
import styles from './Animate.module.css'

const COPY = t.animation.panel

type Mode = 'element' | 'page'

/** What the grid needs to know about a preset, whichever registry it comes from. */
interface Entry {
  id: string
  label: string
  group: string
  defaults: PresetDefaults
  directions?: readonly AnimDirection[]
}

/** The presets of a slot, grouped as the panel lists them; follows the registries, so a plugin's preset appears at once. */
function usePresetGroups(slot: AnimSlot): [string, Entry[]][] {
  const inOut = useSyncExternalStore(inOutPresets.subscribe, inOutPresets.getSnapshot)
  const emphasis = useSyncExternalStore(emphasisPresets.subscribe, emphasisPresets.getSnapshot)
  // The panel rerenders on locale changes; registry snapshots retain their identity, so read labels each time.
  if (slot === 'emphasis') return [['emphasis', emphasis.map((p) => ({ id: p.id, label: p.label, group: 'emphasis', defaults: p.defaults }))]]
  const groups = new Map<string, Entry[]>()
  for (const p of inOut) groups.set(p.group, [...(groups.get(p.group) ?? []), { id: p.id, label: p.label, group: p.group, defaults: p.defaults, directions: p.directions }])
  return [...groups]
}

/** Arrow keys move between the tiles of a grid (the tab key would otherwise walk through every one of them). */
function onGridKey(e: React.KeyboardEvent<HTMLDivElement>): void {
  if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return
  const tiles = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button')]
  const at = tiles.indexOf(document.activeElement as HTMLButtonElement)
  if (at < 0) return
  const columns = Math.max(1, Math.round(e.currentTarget.clientWidth / (tiles[0]?.offsetWidth || 1)))
  const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowDown' ? columns : -columns
  const next = tiles[Math.min(tiles.length - 1, Math.max(0, at + step))]
  if (next && next !== tiles[at]) {
    e.preventDefault()
    next.focus()
  }
}

function sampleAnim(entry: Entry): Anim {
  const direction = entry.defaults.direction ?? entry.directions?.[0]
  return { preset: entry.id, durationMs: entry.defaults.durationMs, delayMs: 0, easing: entry.defaults.easing, ...(direction ? { direction } : {}) }
}

/* ------------------------------------------------------------------------------------------------
 * The selected elements
 * ---------------------------------------------------------------------------------------------- */

interface ElementViewProps {
  animation: ObjectAnimation | undefined
  count: number
  hasText: boolean
  onPage(): void
}

function ElementView({ animation, count, hasText, onPage }: ElementViewProps) {
  const editor = useEditor()
  const [slot, setSlot] = useState<AnimSlot>('enter')
  const groups = usePresetGroups(slot)
  const anim = animation?.[slot]
  const patch = (p: Partial<Anim>, field: string): void => editor.animation.patch(slot, p, undefined, `anim-panel:${slot}:${field}`)
  return (
    <>
      <p className={styles.selected} data-testid="animate-selected">
        {COPY.selected(count)}
      </p>
      <Segmented<AnimSlot>
        label={COPY.slots}
        value={slot}
        options={SLOTS.map((value) => ({ value, label: COPY.slot[value], icon: animation?.[value] ? <span className={styles.dot} role="img" aria-label={COPY.set} /> : undefined }))}
        onChange={setSlot}
        className={styles.slots}
      />
      <p className={styles.hint}>{COPY.slotHint[slot]}</p>
      <div className={styles.sections}>
        {groups.map(([group, entries]) => {
          const title = slot === 'emphasis' ? COPY.slot.emphasis : (COPY.groups[group as keyof typeof COPY.groups] ?? group)
          return (
            <section key={group} className={styles.group}>
              {slot === 'emphasis' ? null : <h3 className={styles.groupTitle}>{title}</h3>}
              <div className={styles.grid} role="group" aria-label={title} onKeyDown={onGridKey}>
                {entries.map((entry) => {
                  const selected = anim?.preset === entry.id
                  return (
                    <AnimateThumb
                      key={entry.id}
                      label={entry.label}
                      selected={selected}
                      subject={{ kind: 'anim', slot, anim: selected && anim ? anim : sampleAnim(entry) }}
                      testId={`animate-${slot}-${entry.id}`}
                      onPick={() => editor.animation.setPreset(slot, entry.id)}
                    />
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
      {anim ? (
        <section className={styles.settingsBox} aria-label={COPY.settings}>
          <h3 className={styles.groupTitle}>
            {COPY.settings}: {presetLabel(slot, anim.preset)}
          </h3>
          <AnimateSettings slot={slot} anim={anim} hasText={hasText} onPatch={patch} />
          <Button variant="ghost" icon={<Trash2 size={15} />} onClick={() => editor.animation.remove(slot)} data-testid="animate-remove">
            {COPY.remove}
          </Button>
        </section>
      ) : null}
      <Button variant="soft" icon={<Sparkles size={15} />} onClick={onPage} className={styles.toPage} data-testid="animate-to-page">
        {COPY.animatePage}
      </Button>
    </>
  )
}

/* ------------------------------------------------------------------------------------------------
 * The page
 * ---------------------------------------------------------------------------------------------- */

function TransitionView({ pageId, transition }: { pageId: string; transition: PageTransition | undefined }) {
  const editor = useEditor()
  const list = useSyncExternalStore(transitionPresets.subscribe, transitionPresets.getSnapshot)
  const current = transition && transitionPresets.has(transition.preset) ? transition : undefined
  const preset = current ? transitionPresets.get(current.preset) : undefined
  const directions = preset?.directions ?? []
  const set = (next: PageTransition | null): void => editor.pages.setTransition(pageId, next)
  const patch = (p: Partial<PageTransition>): void => current && set(patchTransition(current, p))
  return (
    <section className={styles.group}>
      <h3 className={styles.groupTitle}>{COPY.transition}</h3>
      <p className={styles.hint}>{COPY.transitionHint}</p>
      <div className={styles.grid} role="group" aria-label={COPY.transitions} onKeyDown={onGridKey}>
        {list.map((p) => {
          const none = p.id === 'none'
          const selected = none ? !current : current?.preset === p.id
          const shown = (!none && selected && current) || newTransition(p.id)
          return (
            <AnimateThumb
              key={p.id}
              label={p.label}
              selected={selected}
              subject={{ kind: 'transition', transition: { preset: p.id, easing: shown ? shown.easing : p.defaults.easing, direction: shown ? shown.direction : undefined }, durationMs: shown ? shown.durationMs : p.defaults.durationMs }}
              testId={`animate-transition-${p.id}`}
              onPick={() => set(none ? null : newTransition(p.id))}
            />
          )
        })}
      </div>
      {current ? (
        <div className={styles.settings} data-testid="animate-transition-settings">
          {directions.length > 1 ? (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>{COPY.transitionDirection}</span>
              <Segmented<AnimDirection>
                label={COPY.transitionDirection}
                value={current.direction ?? directions[0]}
                options={directions.map((d) => ({ value: d, label: COPY.transitionFrom[d] }))}
                onChange={(direction) => patch({ direction })}
              />
            </div>
          ) : null}
          <NumberField
            label={COPY.duration}
            showLabel
            value={Math.round(current.durationMs / 100) / 10}
            min={TRANSITION_RANGE.min / 1000}
            max={TRANSITION_RANGE.max / 1000}
            step={0.1}
            decimals={1}
            suffix={COPY.seconds}
            hint={COPY.transitionDurationHint}
            onChange={(v) => patch({ durationMs: Math.round(v * 1000) })}
          />
          <label className={styles.field}>
            <span className={styles.fieldLabel}>{COPY.easing}</span>
            <Select aria-label={COPY.easing} value={current.easing} onChange={(e) => patch({ easing: EASINGS.find((x) => x === e.target.value) ?? current.easing })}>
              {EASINGS.map((easing) => (
                <option key={easing} value={easing}>
                  {COPY.easings[easing]}
                </option>
              ))}
            </Select>
          </label>
          <div className={styles.buttons}>
            <Button variant="soft" onClick={() => editor.pages.setTransitionAll(current)} data-testid="animate-transition-all">
              {COPY.applyAll}
            </Button>
            <Button variant="ghost" icon={<Trash2 size={15} />} onClick={() => set(null)} data-testid="animate-transition-remove">
              {COPY.removeTransition}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function PageView({ pageId, transition, animated }: { pageId: string; transition: PageTransition | undefined; animated: boolean }) {
  const editor = useEditor()
  return (
    <div className={styles.sections}>
      <section className={styles.group}>
        <h3 className={styles.groupTitle}>{COPY.pageStyle}</h3>
        <p className={styles.hint}>{COPY.pageStyleHint}</p>
        <div className={styles.styles} role="group" aria-label={COPY.pageStyle}>
          {PAGE_STYLES.map((style) => (
            <button key={style.id} type="button" className={styles.chip} data-testid={`animate-style-${style.id}`} onClick={() => editor.animation.applyPageStyle(style.id)}>
              {COPY.styles[style.id as keyof typeof COPY.styles] ?? style.id}
            </button>
          ))}
        </div>
        <Button variant="ghost" icon={<Trash2 size={15} />} disabled={!animated} onClick={() => editor.animation.clearPage()} data-testid="animate-clear-page">
          {COPY.clearPage}
        </Button>
      </section>
      <TransitionView pageId={pageId} transition={transition} />
    </div>
  )
}

/* ------------------------------------------------------------------------------------------------
 * The panel
 * ---------------------------------------------------------------------------------------------- */

export function AnimatePanel() {
  useLocale()
  const selection = useSelection()
  const pageId = useEditorState((s) => s.activePageId)
  const transition = useEditorState((s) => s.doc.pages.find((p) => p.id === s.activePageId)?.transition)
  const animated = useEditorState((s) => s.doc.pages.find((p) => p.id === s.activePageId)?.objects.some((o) => o.animation !== undefined) ?? false)
  const count = selection.ids.length
  const [mode, setMode] = useState<Mode>(count > 0 ? 'element' : 'page')
  // Selecting something brings the element view forward, once per selection.
  const had = useRef(count > 0)
  useEffect(() => {
    if (count > 0 && !had.current) setMode('element')
    had.current = count > 0
  }, [count])

  const first = selection.objects[0]
  const animation = useMemo(() => readAnimation(first?.animation), [first])
  const hasText = selection.kinds.includes('text')
  const showElement = mode === 'element'

  return (
    <div className={styles.panel} data-testid="animate-panel">
      <Segmented<Mode>
        label={COPY.modes}
        value={mode}
        options={[
          { value: 'element', label: COPY.element },
          { value: 'page', label: COPY.page },
        ]}
        onChange={setMode}
      />
      {showElement ? (
        count === 0 ? (
          <div className={styles.empty} data-testid="animate-empty">
            <Sparkles size={22} aria-hidden="true" />
            <p className={styles.emptyTitle}>{COPY.emptyTitle}</p>
            <p>{COPY.emptyBody}</p>
            <Button variant="soft" onClick={() => setMode('page')}>
              {COPY.animatePage}
            </Button>
          </div>
        ) : (
          <ElementView animation={animation} count={count} hasText={hasText} onPage={() => setMode('page')} />
        )
      ) : (
        <PageView pageId={pageId} transition={transition} animated={animated} />
      )}
    </div>
  )
}
