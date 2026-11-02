import { ChevronDown, ChevronRight, Clapperboard, Eye, EyeOff, Folder, GripVertical, Image as ImageIcon, LayoutGrid, Lock, Minus, QrCode, Shapes, Square, Tag, Type, Unlock } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import type { DocObject } from '@/types/document'
import { useEditor, useEditorState, useEditorStateShallow } from '../context'
import { childrenOf } from '../engine/docOps'
import { readField } from '../engine/fields'
import { kindOfDoc } from '../engine/objects/kinds'
import { useResolvedSrc } from '../hooks/useResolvedSrc'
import { t } from '../strings'
import styles from './LayersPanel.module.css'

interface Row {
  obj: DocObject
  depth: number
  kind: string
  top: boolean
}

function labelOf(o: DocObject, kind: string): string {
  if (typeof o.name === 'string' && o.name.trim()) return o.name
  if (kind === 'text' && typeof o.text === 'string' && o.text.trim()) return o.text.replace(/\s+/g, ' ').slice(0, 40)
  return t.kinds[kind as keyof typeof t.kinds] ?? t.kinds.object
}

function KindIcon({ obj, kind }: { obj: DocObject; kind: string }) {
  const picture = kind === 'image' || kind === 'video'
  const src = useResolvedSrc(picture && typeof obj.src === 'string' ? obj.src : undefined)
  if (picture && src) return <img className={styles.thumb} src={src} alt="" draggable={false} />
  const Icon = kind === 'text' ? Type : kind === 'image' ? ImageIcon : kind === 'image-grid' ? LayoutGrid : kind === 'video' ? Clapperboard : kind === 'line' ? Minus : kind === 'group' ? Folder : kind === 'qr' ? QrCode : kind === 'element' ? Shapes : Square
  const fill = typeof obj.fill === 'string' && kind === 'shape' ? obj.fill : undefined
  return (
    <span className={styles.icon} style={fill ? { color: fill } : undefined}>
      <Icon size={16} fill={fill ? 'currentColor' : 'none'} />
    </span>
  )
}

export function LayersPanel() {
  const editor = useEditor()
  const activeId = useEditorState((s) => s.activePageId)
  const objects = useEditorState((s) => s.doc.pages.find((p) => p.id === s.activePageId)?.objects ?? [])
  const selected = useEditorStateShallow((s) => s.selection.ids)
  const readOnly = useEditorState((s) => s.readOnly)
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  const [renaming, setRenaming] = useState<string | null>(null)
  const [drag, setDrag] = useState<string | null>(null)
  const [over, setOver] = useState<{ id: string; side: 'above' | 'below' } | null>(null)
  const treeRef = useRef<HTMLDivElement>(null)

  const rows = useMemo(() => {
    const out: Row[] = []
    const walk = (list: readonly DocObject[], depth: number): void => {
      for (let i = list.length - 1; i >= 0; i--) {
        const obj = list[i]
        const kind = kindOfDoc(obj)
        out.push({ obj, depth, kind, top: depth === 0 })
        if (kind === 'group' && open.has(obj.id)) walk(childrenOf(obj), depth + 1)
      }
    }
    walk(objects, 0)
    return out
  }, [objects, open])

  const stackOrder = objects.map((o) => o.id)

  const toggleOpen = (id: string): void =>
    setOpen((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const onDrop = (): void => {
    if (!drag || !over) return
    const without = stackOrder.filter((id) => id !== drag)
    const target = without.indexOf(over.id)
    if (target >= 0) editor.arrange.reorderTo(drag, over.side === 'above' ? target + 1 : target)
    setDrag(null)
    setOver(null)
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    const rowsEls = [...(treeRef.current?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? [])]
    const idx = rowsEls.indexOf(document.activeElement as HTMLElement)
    if (idx < 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      rowsEls[Math.min(rowsEls.length - 1, idx + 1)]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      rowsEls[Math.max(0, idx - 1)]?.focus()
    }
  }

  if (rows.length === 0) return <p className={styles.empty}>{t.panels.layersEmpty}</p>

  return (
    <div ref={treeRef} role="tree" aria-label={t.panels.layerTree} aria-multiselectable="true" className={styles.tree} onKeyDown={onKeyDown} key={activeId}>
      {rows.map(({ obj, depth, kind, top }) => {
        const isSel = selected.includes(obj.id)
        const hidden = obj.visible === false
        const locked = obj.locked === true
        const isGroup = kind === 'group'
        const expanded = open.has(obj.id)
        const label = labelOf(obj, kind)
        const field = readField(obj.field)
        return (
          <div
            key={obj.id}
            role="treeitem"
            tabIndex={0}
            aria-level={depth + 1}
            aria-selected={isSel}
            aria-expanded={isGroup ? expanded : undefined}
            className={`${styles.row} ${isSel ? styles.selected : ''} ${hidden ? styles.hidden : ''} ${over?.id === obj.id ? styles[over.side] : ''}`}
            style={{ paddingLeft: 6 + depth * 18 }}
            draggable={top && !readOnly && renaming !== obj.id}
            onDragStart={(e) => {
              setDrag(obj.id)
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData('text/x-doory-layer', obj.id)
            }}
            onDragOver={(e) => {
              if (!drag || !top || drag === obj.id) return
              e.preventDefault()
              const r = e.currentTarget.getBoundingClientRect()
              const side = e.clientY < r.top + r.height / 2 ? 'above' : 'below'
              setOver((c) => (c?.id === obj.id && c.side === side ? c : { id: obj.id, side }))
            }}
            onDrop={(e) => {
              e.preventDefault()
              onDrop()
            }}
            onDragEnd={() => {
              setDrag(null)
              setOver(null)
            }}
            onClick={(e) => editor.arrange.selectLayer(obj.id, e.shiftKey || e.metaKey || e.ctrlKey)}
            onContextMenu={(e) => {
              // The canvas's right-click menu (cut, copy, delete, arrange...) for this layer; a right-click on a
              // layer outside the selection selects it first, like it does on the canvas.
              if (readOnly) return
              e.preventDefault()
              if (!isSel) editor.arrange.selectLayer(obj.id)
              editor.onContextMenu(activeId, e.clientX, e.clientY)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                editor.arrange.selectLayer(obj.id, e.shiftKey)
              } else if (e.key === 'F2' && !readOnly) {
                setRenaming(obj.id)
              } else if (e.altKey && top && !readOnly && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                e.preventDefault()
                e.stopPropagation()
                const i = stackOrder.indexOf(obj.id)
                editor.arrange.reorderTo(obj.id, e.key === 'ArrowUp' ? i + 1 : i - 1)
              } else if (e.key === 'ArrowRight' && isGroup && !expanded) toggleOpen(obj.id)
              else if (e.key === 'ArrowLeft' && isGroup && expanded) toggleOpen(obj.id)
            }}
          >
            <span className={styles.grip} aria-hidden="true">
              {top && !readOnly ? <GripVertical size={14} /> : null}
            </span>
            {isGroup ? (
              <button type="button" className={styles.chev} aria-label={expanded ? t.panels.collapseGroup : t.panels.expandGroup} tabIndex={-1} onClick={(e) => { e.stopPropagation(); toggleOpen(obj.id) }}>
                {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            ) : (
              <span className={styles.chevSpace} />
            )}
            <KindIcon obj={obj} kind={kind} />
            {renaming === obj.id ? (
              <input
                className={styles.rename}
                defaultValue={typeof obj.name === 'string' ? obj.name : label}
                aria-label={t.panels.renameLayer}
                autoFocus
                onClick={(e) => e.stopPropagation()}
                onBlur={(e) => {
                  editor.arrange.rename(obj.id, e.currentTarget.value)
                  setRenaming(null)
                }}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Enter') e.currentTarget.blur()
                  if (e.key === 'Escape') setRenaming(null)
                }}
              />
            ) : (
              <span className={styles.label} onDoubleClick={() => (readOnly ? undefined : setRenaming(obj.id))}>
                {label}
              </span>
            )}
            {field ? (
              <span className={styles.fieldTag} title={t.panels.fieldLayer(field.key)} aria-label={t.panels.fieldLayer(field.key)} role="img">
                <Tag size={12} />
              </span>
            ) : null}
            {readOnly ? null : (
              <span className={styles.toggles}>
                <button type="button" tabIndex={-1} className={`${styles.toggle} ${locked ? styles.on : ''}`} aria-label={locked ? t.panels.unlockLayer : t.panels.lockLayer} aria-pressed={locked} onClick={(e) => { e.stopPropagation(); editor.arrange.setLocked(obj.id, !locked) }}>
                  {locked ? <Lock size={14} /> : <Unlock size={14} />}
                </button>
                <button type="button" tabIndex={-1} className={`${styles.toggle} ${hidden ? styles.on : ''}`} aria-label={hidden ? t.panels.showLayer : t.panels.hideLayer} aria-pressed={hidden} onClick={(e) => { e.stopPropagation(); editor.arrange.setVisible(obj.id, hidden) }}>
                  {hidden ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
