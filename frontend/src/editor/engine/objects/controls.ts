/**
 * Selection handles per kind of object: shapes get all eight resize handles so
 * width and height can be changed on their own; photos, stickers, groups and curved text get the four corner
 * handles only (stretching one side would distort them); text boxes keep the two side handles because those
 * change the wrap width, not the glyph shapes; lines get a handle on each end (see `DoryLine`). The rotate
 * handle floats 28 px above the top edge and shows a rotate glyph.
 */
import { ActiveSelection, Circle, controlsUtils, Ellipse, type FabricObject, IText, Path, Polygon, Polyline, Rect, Textbox, Triangle } from 'fabric'
import { DoryLine, installLineControls } from './DoryLine'
import { asDory } from './dory'

const ROTATE_RADIUS = 7
export const ROTATE_OFFSET = -28
const EDGES = ['ml', 'mr', 'mt', 'mb'] as const

const SHAPE_CLASSES: readonly (abstract new (...args: never[]) => FabricObject)[] = [Rect, Circle, Ellipse, Triangle, Polygon, Polyline, Path]

function isShape(obj: FabricObject): boolean {
  return SHAPE_CLASSES.some((cls) => obj instanceof cls)
}

function paintRotateGlyph(ctx: CanvasRenderingContext2D, left: number, top: number, accent: string): void {
  ctx.save()
  ctx.fillStyle = '#ffffff'
  ctx.strokeStyle = accent
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(left, top, ROTATE_RADIUS, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  // Three quarters of a circle with an arrow tip: "turn".
  const inner = ROTATE_RADIUS - 3
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.arc(left, top, inner, Math.PI * 0.15, Math.PI * 1.7)
  ctx.stroke()
  const tipX = left + Math.cos(Math.PI * 0.15) * inner
  const tipY = top + Math.sin(Math.PI * 0.15) * inner
  ctx.beginPath()
  ctx.moveTo(tipX, tipY)
  ctx.lineTo(tipX + 2.4, tipY - 0.6)
  ctx.lineTo(tipX + 0.6, tipY + 2.2)
  ctx.closePath()
  ctx.fillStyle = accent
  ctx.fill()
  ctx.restore()
}

/** Applies the handle set that belongs to `obj`'s kind. Safe to call repeatedly. */
export function customizeControls(obj: FabricObject): void {
  if (obj instanceof ActiveSelection) return
  if (obj instanceof DoryLine) {
    installLineControls(obj)
    return
  }
  const controls = obj.controls as Record<
    string,
    | {
        visible: boolean
        offsetY: number
        sizeX: number
        sizeY: number
        touchSizeX: number
        touchSizeY: number
        render: unknown
        actionHandler?: unknown
        actionName?: string
        getActionName?: unknown
      }
    | undefined
  >
  const imageGrid = asDory(obj).imageGrid !== undefined
  if (imageGrid) obj.set({ lockScalingFlip: true, lockSkewingX: true, lockSkewingY: true })
  // Text: the side handles set the wrap width of a text box (not while it rides a curve), a top or bottom handle
  // would only distort the glyphs. Shapes keep every handle; everything else (photos, groups, stickers) only the corners.
  const sidesOnly = obj instanceof IText
  const wrapWidth = obj instanceof Textbox && !(typeof (obj as { curveAmount?: number }).curveAmount === 'number' && (obj as { curveAmount?: number }).curveAmount !== 0)
  for (const name of EDGES) {
    const control = controls[name]
    if (!control) continue
    if (sidesOnly) control.visible = wrapWidth && (name === 'ml' || name === 'mr')
    else control.visible = isShape(obj) || imageGrid
    if (imageGrid && (name === 'ml' || name === 'mr')) {
      control.actionHandler = controlsUtils.scalingX
      control.actionName = 'scaleX'
      control.getActionName = () => 'scaleX'
    } else if (imageGrid && (name === 'mt' || name === 'mb')) {
      control.actionHandler = controlsUtils.scalingY
      control.actionName = 'scaleY'
      control.getActionName = () => 'scaleY'
    }
  }
  const rotate = controls.mtr
  if (rotate) {
    rotate.offsetY = ROTATE_OFFSET
    rotate.sizeX = rotate.sizeY = ROTATE_RADIUS * 2 + 4
    rotate.touchSizeX = rotate.touchSizeY = ROTATE_RADIUS * 2 + 12
    rotate.render = (ctx: CanvasRenderingContext2D, left: number, top: number, _style: unknown, target: FabricObject) => {
      paintRotateGlyph(ctx, left, top, typeof target.borderColor === 'string' ? target.borderColor : '#6a52d9')
    }
  }
}
