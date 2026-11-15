/**
 * The enter / exit presets that ship with the editor, registered the way a plugin would. Each `effect` is the look
 * of an object from hidden (`p = 0`) to resting (`p = 1`); an exit plays it backwards. `c.k` is the strength
 * (intensity times two), `c.u` a typical travel length for the page.
 */
import { localized } from '@/i18n/catalog'
import { writableMetadata } from '@/i18n/metadata'
import { clamp01, mix } from './easing'
import { hash01, rotateAbout, sideVector } from './effectMath'
import { type Clip, type Effect, type EffectContext, type EffectFn, registerInOutPreset } from './presets'
import { animationStrings as a } from './strings'

const EDGE = 0.3
const rectClip = (x0: number, y0: number, x1: number, y1: number, fixed?: boolean): Clip => ({ shape: 'rect', x0, y0, x1, y1, ...(fixed ? { fixed } : {}) })

/** A reveal from one side of the box to the other. `side` is the edge it starts from. */
function revealFrom(side: 'left' | 'right' | 'up' | 'down', p: number): Clip {
  const to = 1 + EDGE
  switch (side) {
    case 'left':
      return rectClip(-EDGE, -EDGE, mix(-EDGE, to, p), to)
    case 'right':
      return rectClip(mix(to, -EDGE, p), -EDGE, to, to)
    case 'up':
      return rectClip(-EDGE, -EDGE, to, mix(-EDGE, to, p))
    case 'down':
      return rectClip(-EDGE, mix(to, -EDGE, p), to, to)
  }
}

const sideOf = (c: EffectContext, fallback: 'left' | 'right' | 'up' | 'down'): 'left' | 'right' | 'up' | 'down' => {
  const d = c.direction
  return d === 'left' || d === 'right' || d === 'up' || d === 'down' ? d : fallback
}

const MOVES = ['left', 'right', 'up', 'down'] as const

const fade: EffectFn = (p) => ({ opacity: p })
const rise: EffectFn = (p, c) => ({ opacity: p, ty: (1 - p) * c.u * c.k })
const drop: EffectFn = (p, c) => ({ opacity: p, ty: -(1 - p) * c.u * c.k })

const pop: EffectFn = (p, c) => {
  const s = mix(clamp01(1 - 0.5 * c.k), 1, p)
  return { opacity: Math.min(1, p * 1.8), scaleX: s, scaleY: s }
}

const grow: EffectFn = (p, c) => {
  const s = mix(clamp01(1 - c.k), 1, p)
  return { opacity: Math.min(1, p * 3), scaleX: s, scaleY: s }
}

const zoom: EffectFn = (p, c) => {
  const s = mix(c.direction === 'out' ? 1 + c.k : Math.max(0.05, 1 - 0.6 * c.k), 1, p)
  return { opacity: p, scaleX: s, scaleY: s, blur: (1 - p) * c.u * 0.2 * c.k }
}

const slide: EffectFn = (p, c) => {
  const away = 1 - p
  switch (sideOf(c, 'left')) {
    case 'left':
      return { tx: -away * c.reach.left }
    case 'right':
      return { tx: away * c.reach.right }
    case 'up':
      return { ty: -away * c.reach.up }
    case 'down':
      return { ty: away * c.reach.down }
  }
}

const wipe: EffectFn = (p, c) => ({ clip: revealFrom(sideOf(c, 'left'), p) })

const blur: EffectFn = (p, c) => ({ opacity: p, blur: (1 - p) * c.u * 0.28 * c.k })

const spin: EffectFn = (p, c) => {
  const s = mix(clamp01(1 - 0.7 * c.k), 1, p)
  return { opacity: Math.min(1, p * 2), rotate: -(1 - p) * 270 * c.k, scaleX: s, scaleY: s }
}

const flip: EffectFn = (p, c) => {
  const side = sideOf(c, 'left')
  const lean = (1 - p) * 14 * (side === 'left' || side === 'up' ? 1 : -1)
  return side === 'left' || side === 'right'
    ? { opacity: Math.min(1, p * 5), scaleX: p, skewY: lean }
    : { opacity: Math.min(1, p * 5), scaleY: p, skewX: lean }
}

const tumble: EffectFn = (p, c) => {
  const s = mix(0.6, 1, p)
  return { opacity: p, rotate: -(1 - p) * 120 * c.k, ty: -(1 - p) * c.u * 1.2 * c.k, scaleX: s, scaleY: s }
}

const bounce: EffectFn = (p, c) => ({ opacity: Math.min(1, p * 8), ty: -(1 - p) * c.u * 3 * c.k })

const drift: EffectFn = (p, c) => {
  const v = sideVector(c.direction, 'left')
  const away = 1 - p
  return { opacity: p, tx: v.x * away * c.u * 1.6 * c.k, ty: v.y !== 0 ? v.y * away * c.u * 1.6 * c.k : away * c.u * 0.4 * c.k }
}

/** Letters, words or lines appear one after another; an object that is not text is wiped in from the left. */
const typewriter: EffectFn = (p, c) => (c.unit ? { opacity: p } : { clip: revealFrom('left', p) })

/** Lines of text rise out of their own baseline; any other object rises out of its bottom edge. */
const baseline: EffectFn = (p, c) => {
  const ty = (1 - p) * c.h
  return c.unit ? { ty, clipToUnit: true } : { ty, clip: rectClip(-0.1, 0, 1.1, 1, true) }
}

const stomp: EffectFn = (p, c) => {
  const s = mix(1 + 1.6 * c.k, 1, p)
  return { opacity: Math.min(1, p * 5), scaleX: s, scaleY: s, rotate: -(1 - p) * 8, blur: (1 - p) * c.u * 0.1 }
}

/** On/off stretches of the flicker, as shares of the span; between them the sign is dim. */
const FLICKER: readonly (readonly [number, number])[] = [
  [0.12, 0.16],
  [0.24, 0.27],
  [0.38, 0.47],
  [0.55, 0.58],
  [0.66, 1.01],
]
const neon: EffectFn = (p) => {
  for (const [from, to] of FLICKER) if (p >= from && p < to) return { opacity: 1 }
  return { opacity: p > 0.1 ? 0.08 : 0 }
}

const swing: EffectFn = (p, c) => ({ opacity: Math.min(1, p * 3), ...rotateAbout(-(1 - p) * 70 * c.k, 0, -c.h / 2) })

const unfold: EffectFn = (p, c) => ({ opacity: Math.min(1, p * 3), scaleY: p, ty: -(1 - p) * (c.h / 2) })

const curtain: EffectFn = (p) => ({ clip: rectClip(mix(0.5, -EDGE, p), -EDGE, mix(0.5, 1 + EDGE, p), 1 + EDGE) })

const iris: EffectFn = (p) => {
  const r = mix(0, 0.85, p)
  return { clip: { shape: 'ellipse', x0: 0.5 - r, y0: 0.5 - r, x1: 0.5 + r, y1: 0.5 + r } }
}

const glitch: EffectFn = (p, c) => {
  if (p >= 1) return {}
  const step = Math.floor(p * 16)
  const left = 1 - p
  const visible = p >= 0.08 && hash01(c.seed, step + 7) > 0.35
  return {
    opacity: p >= 0.9 ? 1 : visible ? 1 : p < 0.08 ? 0 : 0.25,
    tx: (hash01(c.seed, step) - 0.5) * c.u * 0.8 * c.k * left,
    skewX: (hash01(c.seed, step + 99) - 0.5) * 30 * left,
  }
}

const MAX_ROLL_DEG = 1080
const roll: EffectFn = (p, c) => {
  const toRight = sideOf(c, 'left') === 'left'
  const distance = (toRight ? c.reach.left : c.reach.right) * (1 - p)
  const turn = Math.min(MAX_ROLL_DEG, (distance * 2 * 57.2958) / Math.max(1, c.w))
  return { tx: toRight ? -distance : distance, rotate: toRight ? -turn : turn }
}

const focus: EffectFn = (p, c) => {
  const s = mix(1 + 0.25 * c.k, 1, p)
  return { opacity: p, scaleX: s, scaleY: s, blur: (1 - p) * c.u * 0.25 * c.k }
}

const elastic: EffectFn = (p, c) => ({ opacity: Math.min(1, p * 4), scaleX: p, scaleY: mix(1 + 0.6 * c.k, 1, p) })

const whip: EffectFn = (p, c) => {
  const away = 1 - p
  const side = sideOf(c, 'left')
  const fx: Effect = { opacity: Math.min(1, p * 4), blur: away * c.u * 0.15 }
  switch (side) {
    case 'left':
      return { ...fx, tx: -away * c.reach.left, skewX: -away * 35 * c.k }
    case 'right':
      return { ...fx, tx: away * c.reach.right, skewX: away * 35 * c.k }
    case 'up':
      return { ...fx, ty: -away * c.reach.up, skewY: away * 35 * c.k }
    case 'down':
      return { ...fx, ty: away * c.reach.down, skewY: -away * 35 * c.k }
  }
}

export function registerBuiltinInOut(): void {
  const n = localized(a.presets, 'animation.presets')
  const reg = registerInOutPreset
  reg(writableMetadata({ id: 'fade', get label() { return n.fade }, group: 'basic', order: 10, defaults: { durationMs: 600, easing: 'ease-out' }, textUnits: true, effect: fade }))
  reg(writableMetadata({ id: 'rise', get label() { return n.rise }, group: 'basic', order: 20, defaults: { durationMs: 700, easing: 'ease-out' }, textUnits: true, effect: rise }))
  reg(writableMetadata({ id: 'drop', get label() { return n.drop }, group: 'basic', order: 30, defaults: { durationMs: 700, easing: 'ease-out' }, textUnits: true, effect: drop }))
  reg(writableMetadata({ id: 'pop', get label() { return n.pop }, group: 'basic', order: 40, defaults: { durationMs: 550, easing: 'spring' }, textUnits: true, effect: pop }))
  reg(writableMetadata({ id: 'scale', get label() { return n.scale }, group: 'basic', order: 50, defaults: { durationMs: 600, easing: 'ease-out' }, textUnits: true, effect: grow }))
  reg(writableMetadata({ id: 'zoom', get label() { return n.zoom }, group: 'basic', order: 60, defaults: { durationMs: 800, easing: 'ease-out', direction: 'in' }, directions: ['in', 'out'], effect: zoom }))
  reg(writableMetadata({ id: 'blur', get label() { return n.blur }, group: 'basic', order: 70, defaults: { durationMs: 800, easing: 'ease-out' }, textUnits: true, effect: blur }))
  reg(writableMetadata({ id: 'focus', get label() { return n.focus }, group: 'basic', order: 80, defaults: { durationMs: 900, easing: 'ease-out' }, textUnits: true, effect: focus }))

  reg(writableMetadata({ id: 'slide', get label() { return n.slide }, group: 'motion', order: 100, defaults: { durationMs: 700, easing: 'ease-out' }, directions: MOVES, effect: slide }))
  reg(writableMetadata({ id: 'drift', get label() { return n.drift }, group: 'motion', order: 110, defaults: { durationMs: 1200, easing: 'ease-out' }, directions: MOVES, textUnits: true, effect: drift }))
  reg(writableMetadata({ id: 'bounce', get label() { return n.bounce }, group: 'motion', order: 120, defaults: { durationMs: 1000, easing: 'bounce' }, textUnits: true, effect: bounce }))
  reg(writableMetadata({ id: 'roll', get label() { return n.roll }, group: 'motion', order: 130, defaults: { durationMs: 1100, easing: 'ease-out' }, directions: ['left', 'right'], effect: roll }))
  reg(writableMetadata({ id: 'whip', get label() { return n.whip }, group: 'motion', order: 140, defaults: { durationMs: 450, easing: 'ease-out' }, directions: MOVES, effect: whip }))
  reg(writableMetadata({ id: 'tumble', get label() { return n.tumble }, group: 'motion', order: 150, defaults: { durationMs: 900, easing: 'ease-out' }, textUnits: true, effect: tumble }))

  reg(writableMetadata({ id: 'wipe', get label() { return n.wipe }, group: 'reveal', order: 200, defaults: { durationMs: 700, easing: 'ease-in-out' }, directions: MOVES, effect: wipe }))
  reg(writableMetadata({ id: 'curtain', get label() { return n.curtain }, group: 'reveal', order: 210, defaults: { durationMs: 700, easing: 'ease-in-out' }, effect: curtain }))
  reg(writableMetadata({ id: 'iris', get label() { return n.iris }, group: 'reveal', order: 220, defaults: { durationMs: 800, easing: 'ease-in-out' }, effect: iris }))
  reg(writableMetadata({ id: 'unfold', get label() { return n.unfold }, group: 'reveal', order: 230, defaults: { durationMs: 700, easing: 'ease-out' }, effect: unfold }))
  reg(writableMetadata({ id: 'typewriter', get label() { return n.typewriter }, group: 'reveal', order: 240, defaults: { durationMs: 1500, easing: 'linear' }, textUnits: true, textDefault: 'letter', stagger: 1, effect: typewriter }))
  reg(writableMetadata({ id: 'baseline', get label() { return n.baseline }, group: 'reveal', order: 250, defaults: { durationMs: 800, easing: 'ease-out' }, textUnits: true, textDefault: 'line', stagger: 0.6, effect: baseline }))

  reg(writableMetadata({ id: 'spin', get label() { return n.spin }, group: 'bold', order: 300, defaults: { durationMs: 900, easing: 'ease-out' }, textUnits: true, effect: spin }))
  reg(writableMetadata({ id: 'flip', get label() { return n.flip }, group: 'bold', order: 310, defaults: { durationMs: 800, easing: 'ease-out' }, directions: MOVES, effect: flip }))
  reg(writableMetadata({ id: 'swing', get label() { return n.swing }, group: 'bold', order: 320, defaults: { durationMs: 900, easing: 'ease-out' }, effect: swing }))
  reg(writableMetadata({ id: 'elastic', get label() { return n.elastic }, group: 'bold', order: 330, defaults: { durationMs: 900, easing: 'spring' }, effect: elastic }))
  reg(writableMetadata({ id: 'stomp', get label() { return n.stomp }, group: 'bold', order: 340, defaults: { durationMs: 500, easing: 'ease-in' }, effect: stomp }))
  reg(writableMetadata({ id: 'glitch', get label() { return n.glitch }, group: 'bold', order: 350, defaults: { durationMs: 700, easing: 'linear' }, textUnits: true, effect: glitch }))
  reg(writableMetadata({ id: 'neon-flicker', get label() { return n.neonFlicker }, group: 'bold', order: 360, defaults: { durationMs: 900, easing: 'linear' }, textUnits: true, effect: neon }))
}

registerBuiltinInOut()
