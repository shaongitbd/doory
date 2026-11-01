/**
 * A straight line / arrow. The object is a horizontal segment of length `width` centred on its origin;
 * rotation and position come from the regular Fabric transform, so it scales, rotates, snaps and
 * serialises like any other object. Arrow heads are drawn at either end with a solid pen (dashes only
 * apply to the shaft).
 */
import { classRegistry, Control, FabricObject, type TMat2D, Point, util } from 'fabric'
import type { ArrowHead } from '@/types/document'
import { arrowHeadPath } from './shapeGeometry'

export const HIT_SLOP = 7

export function arrowHeadSize(strokeWidth: number): number {
  return Math.max(10, strokeWidth * 3.6)
}

export class DoryLine extends FabricObject {
  static override type = 'DoryLine'

  declare arrowStart: ArrowHead
  declare arrowEnd: ArrowHead

  static override ownDefaults: Record<string, unknown> = {
    arrowStart: 'none',
    arrowEnd: 'none',
    height: 0,
    strokeLineCap: 'round',
    strokeLineJoin: 'round',
    objectCaching: false,
    strokeUniform: true,
  }

  static override getDefaults(): Record<string, unknown> {
    return { ...super.getDefaults(), ...DoryLine.ownDefaults }
  }

  constructor(options: Record<string, unknown> = {}) {
    super()
    Object.assign(this, DoryLine.ownDefaults)
    this.setOptions(options)
  }

  override _render(ctx: CanvasRenderingContext2D): void {
    const half = this.width / 2
    ctx.beginPath()
    ctx.moveTo(-half, 0)
    ctx.lineTo(half, 0)
    this._renderStroke(ctx)
    const stroke = typeof this.stroke === 'string' ? this.stroke : '#000000'
    const size = arrowHeadSize(this.strokeWidth)
    this.drawHead(ctx, this.arrowStart, -half, Math.PI, size, stroke)
    this.drawHead(ctx, this.arrowEnd, half, 0, size, stroke)
  }

  private drawHead(ctx: CanvasRenderingContext2D, kind: ArrowHead, x: number, angle: number, size: number, color: string): void {
    if (kind === 'none') return
    const { d, fill } = arrowHeadPath(kind, size)
    const scaling = this.getObjectScaling()
    ctx.save()
    ctx.translate(x, 0)
    ctx.rotate(angle)
    // Keep the head the same visual size when the line is stretched.
    ctx.scale(1 / (scaling.x || 1), 1 / (scaling.y || 1))
    ctx.scale(Math.abs(scaling.x) || 1, Math.abs(scaling.y) || 1)
    ctx.setLineDash([])
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = this.strokeWidth
    ctx.strokeStyle = color
    ctx.fillStyle = color
    ctx.stroke(new Path2D(d))
    if (fill) ctx.fill(new Path2D(d))
    ctx.restore()
  }

  /** Thin lines are hard to hit: accept clicks within a few pixels of the segment. */
  override containsPoint(point: Point): boolean {
    const m = this.calcTransformMatrix()
    const a = new Point(-this.width / 2, 0).transform(m)
    const b = new Point(this.width / 2, 0).transform(m)
    const zoom = this.canvas?.getZoom() ?? 1
    const tolerance = Math.max(this.strokeWidth / 2, HIT_SLOP / zoom)
    return distanceToSegment(point, a, b) <= tolerance
  }

  override toObject<T extends Record<string, unknown>, K extends string = never>(propertiesToInclude: K[] = []): T {
    return super.toObject(['arrowStart', 'arrowEnd', ...propertiesToInclude] as never[]) as unknown as T
  }

  /** The line and its heads. `COMMON_PARTS` must be an item of its own: Fabric swaps that item for the line's style. */
  override _toSVG(): string[] {
    const half = this.width / 2
    return [`<line x1="${-half}" y1="0" x2="${half}" y2="0" `, 'COMMON_PARTS', ' />\n', this.headSvg(this.arrowStart, -half, 180), this.headSvg(this.arrowEnd, half, 0)]
  }

  private headSvg(kind: ArrowHead, x: number, angle: number): string {
    if (kind === 'none') return ''
    const { d, fill } = arrowHeadPath(kind, arrowHeadSize(this.strokeWidth))
    const color = util.string.escapeXml(typeof this.stroke === 'string' ? this.stroke : '#000000')
    return `<path d="${d}" transform="translate(${x} 0) rotate(${angle})" fill="${fill ? color : 'none'}" stroke="${color}" stroke-width="${this.strokeWidth}" stroke-linecap="round" stroke-linejoin="round" opacity="${this.opacity}" />\n`
  }
}

/** Ends of a line in scene coordinates. */
function endpoints(line: DoryLine): { start: Point; end: Point } {
  const m = line.calcTransformMatrix()
  return { start: new Point(-line.width / 2, 0).transform(m), end: new Point(line.width / 2, 0).transform(m) }
}

/** Drags one end of the line to the scene point (x, y) while the other end stays where it is. */
export function moveLineEnd(line: DoryLine, which: 'start' | 'end', x: number, y: number): boolean {
  const { start, end } = endpoints(line)
  const a = which === 'start' ? new Point(x, y) : start
  const b = which === 'end' ? new Point(x, y) : end
  const length = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y))
  line.set({ scaleX: 1, scaleY: 1, flipX: false, flipY: false, width: length, angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI })
  line.setPositionByOrigin(new Point((a.x + b.x) / 2, (a.y + b.y) / 2), 'center', 'center')
  line.setCoords()
  return true
}

const END_HANDLE_PX = 10

function endControl(which: 'start' | 'end'): Control {
  return new Control({
    cursorStyle: 'crosshair',
    actionName: 'modifyLine',
    sizeX: END_HANDLE_PX,
    sizeY: END_HANDLE_PX,
    touchSizeX: END_HANDLE_PX + 18,
    touchSizeY: END_HANDLE_PX + 18,
    positionHandler: (_dim, _final, target) => {
      const line = target as DoryLine
      const vpt: TMat2D = line.canvas?.viewportTransform ?? [1, 0, 0, 1, 0, 0]
      const matrix = util.multiplyTransformMatrices(vpt, line.calcTransformMatrix())
      return new Point(which === 'start' ? -line.width / 2 : line.width / 2, 0).transform(matrix)
    },
    actionHandler: (_event, transform, x, y) => moveLineEnd(transform.target as DoryLine, which, x, y),
    render: (ctx, left, top, _style, target) => {
      ctx.save()
      ctx.fillStyle = '#ffffff'
      ctx.strokeStyle = typeof target.borderColor === 'string' ? target.borderColor : '#6a52d9'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(left, top, END_HANDLE_PX / 2, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.restore()
    },
  })
}

/**
 * Lines are edited by their ends, not by a bounding box: one handle on each end, no rotate or resize handles
 * and no dashed border (the two handles are enough to show the selection).
 */
export function installLineControls(line: DoryLine): void {
  line.controls = { p1: endControl('start'), p2: endControl('end') }
  line.hasBorders = false
}

export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

classRegistry.setClass(DoryLine)
