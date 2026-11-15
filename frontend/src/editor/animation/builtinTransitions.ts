/**
 * The page transitions that ship with the editor. `compose(p, direction)` gets eased progress `p` (0 = the page that
 * is left is on screen, 1 = the page that comes in is) and says what each page looks like. The direction is the side
 * the new page comes from; going back through a deck plays a transition the other way round (`reverseDirection`).
 */
import { localized } from '@/i18n/catalog'
import { writableMetadata } from '@/i18n/metadata'
import { mix } from './easing'
import { sideVector } from './effectMath'
import { type PageClip, type TransitionPreset, registerTransitionPreset } from './presets'
import { animationStrings as a } from './strings'

const MOVES = ['right', 'left', 'up', 'down'] as const
const FLIPS = ['left', 'right', 'up', 'down'] as const

type Compose = TransitionPreset['compose']

const none: Compose = (p) => ({ from: { opacity: p >= 1 ? 0 : 1 } })
const fade: Compose = (p) => ({ to: { opacity: p }, toOnTop: true })
const dip: Compose = (p) => (p < 0.5 ? { to: { opacity: 0 }, veil: p * 2 } : { from: { opacity: 0 }, veil: 2 - 2 * p })
const dissolve: Compose = (p) => ({ to: { clip: { kind: 'dissolve', amount: p } }, toOnTop: true })
const blur: Compose = (p) => ({ from: { blur: 0.04 * p }, to: { opacity: p, blur: 0.04 * (1 - p) }, toOnTop: true })

const slide: Compose = (p, d) => {
  const v = sideVector(d, 'right')
  return { from: { dx: -v.x * p * 0.3, dy: -v.y * p * 0.3 }, to: { dx: v.x * (1 - p), dy: v.y * (1 - p) }, toOnTop: true }
}
const push: Compose = (p, d) => {
  const v = sideVector(d, 'right')
  return { from: { dx: -v.x * p, dy: -v.y * p }, to: { dx: v.x * (1 - p), dy: v.y * (1 - p) }, toOnTop: true }
}
const cover: Compose = (p, d) => {
  const v = sideVector(d, 'right')
  return { to: { dx: v.x * (1 - p), dy: v.y * (1 - p) }, toOnTop: true }
}
const uncover: Compose = (p, d) => {
  const v = sideVector(d, 'right')
  return { from: { dx: -v.x * p, dy: -v.y * p }, toOnTop: false }
}

const zoomIn: Compose = (p) => ({ from: { scaleX: 1 + 0.4 * p, scaleY: 1 + 0.4 * p }, to: { opacity: p, scaleX: mix(0.8, 1, p), scaleY: mix(0.8, 1, p) }, toOnTop: true })
const zoomOut: Compose = (p) => ({ from: { opacity: 1 - p, scaleX: 1 - 0.4 * p, scaleY: 1 - 0.4 * p }, to: { scaleX: mix(1.25, 1, p), scaleY: mix(1.25, 1, p) }, toOnTop: false })

const wipe: Compose = (p, d) => {
  const rect = (x0: number, y0: number, x1: number, y1: number): PageClip => ({ kind: 'rect', x0, y0, x1, y1 })
  switch (d ?? 'right') {
    case 'left':
      return { to: { clip: rect(0, 0, p, 1) }, toOnTop: true }
    case 'up':
      return { to: { clip: rect(0, 0, 1, p) }, toOnTop: true }
    case 'down':
      return { to: { clip: rect(0, 1 - p, 1, 1) }, toOnTop: true }
    default:
      return { to: { clip: rect(1 - p, 0, 1, 1) }, toOnTop: true }
  }
}

const circle: Compose = (p) => ({ to: { clip: { kind: 'circle', cx: 0.5, cy: 0.5, r: p * 0.75 } }, toOnTop: true })

const flip: Compose = (p, d) => {
  const horizontal = d !== 'up' && d !== 'down'
  const turn = Math.cos(Math.PI * p)
  const hide = { opacity: 0 }
  if (p < 0.5) return horizontal ? { from: { scaleX: turn }, to: hide, toOnTop: true } : { from: { scaleY: turn }, to: hide, toOnTop: true }
  return horizontal ? { from: hide, to: { scaleX: -turn }, toOnTop: true } : { from: hide, to: { scaleY: -turn }, toOnTop: true }
}

const spin: Compose = (p, d) => {
  const sign = d === 'left' || d === 'up' ? -1 : 1
  const s = 1 - 0.6 * p
  return { from: { opacity: 1 - p, rotate: 90 * p * sign, scaleX: s, scaleY: s }, toOnTop: false }
}

const blinds: Compose = (p, d) => {
  const vertical = d === 'left' || d === 'right' || d === undefined
  return { to: { clip: { kind: 'bars', count: 10, amount: p, vertical } }, toOnTop: true }
}

export function registerBuiltinTransitions(): void {
  const n = localized(a.transitions, 'animation.transitions')
  const reg = registerTransitionPreset
  reg(writableMetadata({ id: 'none', get label() { return n.none }, order: 0, defaults: { durationMs: 200, easing: 'linear' }, compose: none }))
  reg(writableMetadata({ id: 'fade', get label() { return n.fade }, order: 10, defaults: { durationMs: 700, easing: 'ease-in-out' }, compose: fade }))
  reg(writableMetadata({ id: 'fade-black', get label() { return n.fadeBlack }, order: 20, defaults: { durationMs: 1000, easing: 'ease-in-out' }, compose: dip }))
  reg(writableMetadata({ id: 'dissolve', get label() { return n.dissolve }, order: 30, defaults: { durationMs: 900, easing: 'linear' }, compose: dissolve }))
  reg(writableMetadata({ id: 'blur', get label() { return n.blur }, order: 40, defaults: { durationMs: 800, easing: 'ease-in-out' }, compose: blur }))
  reg(writableMetadata({ id: 'slide', get label() { return n.slide }, order: 50, defaults: { durationMs: 700, easing: 'ease-in-out', direction: 'right' }, directions: MOVES, compose: slide }))
  reg(writableMetadata({ id: 'push', get label() { return n.push }, order: 60, defaults: { durationMs: 700, easing: 'ease-in-out', direction: 'right' }, directions: MOVES, compose: push }))
  reg(writableMetadata({ id: 'cover', get label() { return n.cover }, order: 70, defaults: { durationMs: 700, easing: 'ease-in-out', direction: 'right' }, directions: MOVES, compose: cover }))
  reg(writableMetadata({ id: 'uncover', get label() { return n.uncover }, order: 80, defaults: { durationMs: 700, easing: 'ease-in-out', direction: 'right' }, directions: MOVES, compose: uncover }))
  reg(writableMetadata({ id: 'zoom-in', get label() { return n.zoomIn }, order: 90, defaults: { durationMs: 800, easing: 'ease-in-out' }, compose: zoomIn }))
  reg(writableMetadata({ id: 'zoom-out', get label() { return n.zoomOut }, order: 100, defaults: { durationMs: 800, easing: 'ease-in-out' }, compose: zoomOut }))
  reg(writableMetadata({ id: 'wipe', get label() { return n.wipe }, order: 110, defaults: { durationMs: 800, easing: 'ease-in-out', direction: 'right' }, directions: MOVES, compose: wipe }))
  reg(writableMetadata({ id: 'circle', get label() { return n.circle }, order: 120, defaults: { durationMs: 900, easing: 'ease-in-out' }, compose: circle }))
  reg(writableMetadata({ id: 'flip', get label() { return n.flip }, order: 130, defaults: { durationMs: 900, easing: 'ease-in-out', direction: 'left' }, directions: FLIPS, compose: flip }))
  reg(writableMetadata({ id: 'spin', get label() { return n.spin }, order: 140, defaults: { durationMs: 900, easing: 'ease-in-out', direction: 'right' }, directions: ['right', 'left'], compose: spin }))
  reg(writableMetadata({ id: 'blinds', get label() { return n.blinds }, order: 150, defaults: { durationMs: 900, easing: 'ease-in-out', direction: 'left' }, directions: MOVES, compose: blinds }))
}

registerBuiltinTransitions()
