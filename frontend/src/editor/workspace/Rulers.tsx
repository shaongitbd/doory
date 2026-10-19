import { type RefObject, useEffect, useRef } from 'react'
import { useEditor, useEditorState } from '../context'
import { pxToUnit } from '../engine/units'
import styles from './Rulers.module.css'

const THICKNESS = 24

function niceStep(minDisplay: number): number {
  const pow = Math.pow(10, Math.floor(Math.log10(minDisplay)))
  for (const m of [1, 2, 5, 10]) if (m * pow >= minDisplay) return m * pow
  return 10 * pow
}

interface RulersProps {
  scrollRef: RefObject<HTMLDivElement | null>
  artboards: RefObject<Map<string, HTMLDivElement>>
}

/** Rulers along the top and left, measured from the active page; dragging out of a ruler adds a guide. */
export function Rulers({ scrollRef, artboards }: RulersProps) {
  const editor = useEditor()
  const zoom = useEditorState((s) => s.zoom)
  const unit = useEditorState((s) => s.doc.unit)
  const activePageId = useEditorState((s) => s.activePageId)
  const hRef = useRef<HTMLCanvasElement>(null)
  const vRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const scroller = scrollRef.current
    if (!scroller) return
    const draw = (): void => {
      const art = artboards.current.get(activePageId)
      const h = hRef.current
      const v = vRef.current
      if (!art || !h || !v) return
      const sr = scroller.getBoundingClientRect()
      const ar = art.getBoundingClientRect()
      const cs = getComputedStyle(h)
      const bg = cs.getPropertyValue('--ruler-bg').trim() || '#fff'
      const fg = cs.getPropertyValue('--ruler-fg').trim() || '#777'
      const dpr = window.devicePixelRatio || 1
      const unitPx = pxToUnit(1, unit)
      const pxPerUnit = zoom / unitPx
      const major = niceStep(56 / pxPerUnit)
      const minor = major / 5

      const paint = (canvas: HTMLCanvasElement, horizontal: boolean, length: number, origin: number): void => {
        const w = horizontal ? length : THICKNESS
        const hh = horizontal ? THICKNESS : length
        canvas.width = Math.max(1, Math.round(w * dpr))
        canvas.height = Math.max(1, Math.round(hh * dpr))
        canvas.style.width = `${w}px`
        canvas.style.height = `${hh}px`
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.fillStyle = bg
        ctx.fillRect(0, 0, w, hh)
        ctx.strokeStyle = fg
        ctx.fillStyle = fg
        ctx.lineWidth = 1
        ctx.font = '10px system-ui, sans-serif'
        ctx.textBaseline = 'top'
        const startUnit = Math.floor((0 - origin) / pxPerUnit / minor) * minor
        const endUnit = Math.ceil((length - origin) / pxPerUnit / minor) * minor
        ctx.beginPath()
        for (let u = startUnit; u <= endUnit; u += minor) {
          const pos = Math.round(origin + u * pxPerUnit) + 0.5
          const isMajor = Math.abs(u / major - Math.round(u / major)) < 1e-6
          const len = isMajor ? THICKNESS : THICKNESS * 0.3
          if (horizontal) {
            ctx.moveTo(pos, THICKNESS)
            ctx.lineTo(pos, THICKNESS - len)
          } else {
            ctx.moveTo(THICKNESS, pos)
            ctx.lineTo(THICKNESS - len, pos)
          }
          if (isMajor) {
            const label = String(Number(u.toFixed(2)))
            if (horizontal) ctx.fillText(label, pos + 3, 3)
            else {
              ctx.save()
              ctx.translate(3, pos - 3)
              ctx.rotate(-Math.PI / 2)
              ctx.fillText(label, 0, 0)
              ctx.restore()
            }
          }
        }
        ctx.stroke()
        // Page extent highlight.
        ctx.globalAlpha = 0.12
        ctx.fillStyle = cs.getPropertyValue('--ruler-accent').trim() || '#6a52d9'
        if (horizontal) ctx.fillRect(origin, 0, ar.width, THICKNESS)
        else ctx.fillRect(0, origin, THICKNESS, ar.height)
        ctx.globalAlpha = 1
      }
      paint(h, true, sr.width, ar.left - sr.left)
      paint(v, false, sr.height, ar.top - sr.top)
    }
    let raf = 0
    const schedule = (): void => {
      if (raf) cancelAnimationFrame(raf)
      raf = requestAnimationFrame(draw)
    }
    schedule()
    scroller.addEventListener('scroll', schedule, { passive: true })
    const ro = new ResizeObserver(schedule)
    ro.observe(scroller)
    const mo = new MutationObserver(schedule)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'data-contrast'] })
    return () => {
      scroller.removeEventListener('scroll', schedule)
      ro.disconnect()
      mo.disconnect()
      if (raf) cancelAnimationFrame(raf)
    }
  }, [scrollRef, artboards, activePageId, zoom, unit])

  const startGuide = (orientation: 'horizontal' | 'vertical') => (e: React.PointerEvent): void => {
    const art = artboards.current.get(activePageId)
    const line = dragRef.current
    if (!art || !line) return
    e.preventDefault()
    const target = e.currentTarget as HTMLElement
    target.setPointerCapture(e.pointerId)
    const place = (cx: number, cy: number): void => {
      const parent = line.parentElement?.getBoundingClientRect()
      if (!parent) return
      line.style.display = 'block'
      if (orientation === 'vertical') {
        line.style.cssText = `display:block;left:${cx - parent.left}px;top:0;width:1px;height:100%`
      } else {
        line.style.cssText = `display:block;top:${cy - parent.top}px;left:0;height:1px;width:100%`
      }
    }
    const move = (ev: PointerEvent): void => place(ev.clientX, ev.clientY)
    const up = (ev: PointerEvent): void => {
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerup', up)
      line.style.display = 'none'
      const r = art.getBoundingClientRect()
      const z = editor.state.zoom
      const pos = orientation === 'vertical' ? (ev.clientX - r.left) / z : (ev.clientY - r.top) / z
      const size = editor.pageSizeOf(activePageId)
      const max = orientation === 'vertical' ? size.width : size.height
      if (pos > 0 && pos < max) editor.pages.addGuide(activePageId, { orientation, pos: Math.round(pos) })
    }
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', up)
    place(e.clientX, e.clientY)
  }

  return (
    <div className={styles.rulers}>
      <div className={styles.corner} />
      <canvas ref={hRef} data-ruler="horizontal" className={`${styles.ruler} ${styles.h}`} onPointerDown={startGuide('vertical')} aria-hidden="true" />
      <canvas ref={vRef} data-ruler="vertical" className={`${styles.ruler} ${styles.v}`} onPointerDown={startGuide('horizontal')} aria-hidden="true" />
      <div ref={dragRef} className={styles.dragLine} />
    </div>
  )
}
