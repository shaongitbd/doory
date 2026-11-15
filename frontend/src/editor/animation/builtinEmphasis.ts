/**
 * The emphasis presets that ship with the editor: one cycle each (`p` = 0..1), at rest at both ends so that a loop
 * is seamless. `c.k` is the strength, `c.u` a typical travel length for the page.
 */
import { localized } from '@/i18n/catalog'
import { writableMetadata } from '@/i18n/metadata'
import { keyframes, rotateAbout } from './effectMath'
import { type EffectFn, registerEmphasisPreset } from './presets'
import { animationStrings as a } from './strings'

const sinSq = (x: number): number => Math.sin(Math.PI * x) ** 2

const pulse: EffectFn = (p, c) => {
  const s = 1 + 0.1 * c.k * Math.sin(Math.PI * p)
  return { scaleX: s, scaleY: s }
}

const wiggle: EffectFn = (p, c) => ({ rotate: 8 * c.k * Math.sin(6 * Math.PI * p) * Math.sin(Math.PI * p) })

const float: EffectFn = (p, c) => ({ ty: -c.u * 0.25 * c.k * Math.sin(2 * Math.PI * p) })

const shake: EffectFn = (p, c) => ({ tx: c.u * 0.18 * c.k * Math.sin(16 * Math.PI * p) * Math.sin(Math.PI * p) })

const flash: EffectFn = (p, c) => ({ opacity: 1 - Math.min(1, 0.9 * c.k) * ((1 - Math.cos(4 * Math.PI * p)) / 2) })

const heartbeat: EffectFn = (p, c) => {
  const beat = p < 0.3 ? sinSq(p / 0.3) : p < 0.6 ? 0.75 * sinSq((p - 0.3) / 0.3) : 0
  const s = 1 + 0.14 * c.k * beat
  return { scaleX: s, scaleY: s }
}

const TADA_SCALE: readonly (readonly [number, number])[] = [
  [0, 1],
  [0.1, 0.9],
  [0.2, 0.9],
  [0.3, 1.1],
  [0.9, 1.1],
  [1, 1],
]
const TADA_TURN: readonly (readonly [number, number])[] = [
  [0, 0],
  [0.1, -3],
  [0.2, -3],
  [0.3, 3],
  [0.4, -3],
  [0.5, 3],
  [0.6, -3],
  [0.7, 3],
  [0.8, -3],
  [0.9, 3],
  [1, 0],
]
const tada: EffectFn = (p, c) => {
  const s = 1 + (keyframes(p, TADA_SCALE) - 1) * c.k
  return { scaleX: s, scaleY: s, rotate: keyframes(p, TADA_TURN) * c.k }
}

const spinOnce: EffectFn = (p) => ({ rotate: 360 * p })

const hop: EffectFn = (p, c) => ({ ty: -c.u * 0.9 * c.k * Math.abs(Math.sin(2 * Math.PI * p)) })

const jello: EffectFn = (p, c) => ({ skewX: 14 * c.k * Math.exp(-4 * p) * Math.sin(6 * Math.PI * p) })

const swingOnce: EffectFn = (p, c) => rotateAbout(14 * c.k * Math.exp(-3 * p) * Math.sin(5 * Math.PI * p), 0, -c.h / 2)

const breathe: EffectFn = (p, c) => {
  const s = 1 + 0.035 * c.k * Math.sin(2 * Math.PI * p)
  return { scaleX: s, scaleY: s }
}

export function registerBuiltinEmphasis(): void {
  const n = localized(a.emphasis, 'animation.emphasis')
  const reg = registerEmphasisPreset
  reg(writableMetadata({ id: 'pulse', get label() { return n.pulse }, order: 10, defaults: { durationMs: 800, easing: 'ease-in-out' }, effect: pulse }))
  reg(writableMetadata({ id: 'wiggle', get label() { return n.wiggle }, order: 20, defaults: { durationMs: 700, easing: 'linear' }, effect: wiggle }))
  reg(writableMetadata({ id: 'float', get label() { return n.float }, order: 30, defaults: { durationMs: 2400, easing: 'linear', loop: true }, effect: float }))
  reg(writableMetadata({ id: 'shake', get label() { return n.shake }, order: 40, defaults: { durationMs: 600, easing: 'linear' }, effect: shake }))
  reg(writableMetadata({ id: 'flash', get label() { return n.flash }, order: 50, defaults: { durationMs: 900, easing: 'linear' }, effect: flash }))
  reg(writableMetadata({ id: 'heartbeat', get label() { return n.heartbeat }, order: 60, defaults: { durationMs: 1200, easing: 'linear' }, effect: heartbeat }))
  reg(writableMetadata({ id: 'tada', get label() { return n.tada }, order: 70, defaults: { durationMs: 1000, easing: 'linear' }, effect: tada }))
  reg(writableMetadata({ id: 'spin', get label() { return n.spin }, order: 80, defaults: { durationMs: 1000, easing: 'ease-in-out' }, effect: spinOnce }))
  reg(writableMetadata({ id: 'hop', get label() { return n.hop }, order: 90, defaults: { durationMs: 900, easing: 'linear' }, effect: hop }))
  reg(writableMetadata({ id: 'jello', get label() { return n.jello }, order: 100, defaults: { durationMs: 1000, easing: 'linear' }, effect: jello }))
  reg(writableMetadata({ id: 'swing', get label() { return n.swing }, order: 110, defaults: { durationMs: 1400, easing: 'linear' }, effect: swingOnce }))
  reg(writableMetadata({ id: 'breathe', get label() { return n.breathe }, order: 120, defaults: { durationMs: 3000, easing: 'ease-in-out', loop: true }, effect: breathe }))
}

registerBuiltinEmphasis()
