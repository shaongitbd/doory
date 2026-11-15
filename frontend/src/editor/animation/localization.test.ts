import './builtins'
import { activateLocale } from '@/i18n/catalog'
import { setLocale } from '@/i18n/locale'
import { emphasisPresets, inOutPresets, registerEmphasisPreset, registerInOutPreset, registerTransitionPreset, transitionPresets, type EffectContext } from './presets'
import { presetLabel } from './labels'
import { sampleObject } from './sampler'
import { rectObject } from './testing'

afterEach(() => setLocale('en'))

const germanTransitions: Record<string, string> = {
  none: 'Keine', fade: 'Überblenden', 'fade-black': 'Über Schwarz blenden', dissolve: 'Auflösen',
  blur: 'Weichzeichnen', slide: 'Gleiten', push: 'Verschieben', cover: 'Überdecken', uncover: 'Freilegen',
  'zoom-in': 'Vergrößern', 'zoom-out': 'Verkleinern', wipe: 'Wischen', circle: 'Kreisförmig enthüllen',
  flip: 'Umklappen', spin: 'Drehen', blinds: 'Jalousie',
}

const germanInOut: Record<string, string> = {
  fade: 'Einblenden', rise: 'Von unten einblenden', drop: 'Von oben einblenden', pop: 'Aufpoppen', scale: 'Wachsen',
  zoom: 'Zoom', blur: 'Weichzeichnen', focus: 'Fokussieren', slide: 'Gleiten', drift: 'Driften',
  bounce: 'Hüpfen', roll: 'Rollen', whip: 'Heranschnellen', tumble: 'Purzeln', wipe: 'Wischen',
  curtain: 'Vorhang', iris: 'Irisblende', unfold: 'Entfalten', typewriter: 'Schreibmaschine', baseline: 'Grundlinie',
  spin: 'Drehen', flip: 'Umklappen', swing: 'Schwingen', elastic: 'Elastisch', stomp: 'Stampfen', glitch: 'Bildstörung',
  'neon-flicker': 'Neonflackern',
}
const germanEmphasis: Record<string, string> = {
  pulse: 'Pulsieren', wiggle: 'Wackeln', float: 'Schweben', shake: 'Schütteln', flash: 'Blitzen',
  heartbeat: 'Herzschlag', tada: 'Tadaa', spin: 'Drehen', hop: 'Hüpfen', jello: 'Wackelpudding', swing: 'Schwingen', breathe: 'Atmen',
}

it.each([
  ['enter', inOutPresets, germanInOut],
  ['exit', inOutPresets, germanInOut],
  ['emphasis', emphasisPresets, germanEmphasis],
] as const)('localizes every %s preset without replacing registrations or changing effects', async (slot, registry, german) => {
  const before = registry.list()
  const english = before.map(preset => preset.label)
  const defaults = before.map(preset => preset.defaults)
  const effects = before.map(preset => preset.effect)
  const context: EffectContext = { w: 100, h: 60, u: 48, k: 1, direction: undefined, reach: { left: 500, right: 500, up: 300, down: 300 }, seed: 1, unit: false }
  const frames = before.map(preset => [0, 0.5, 1].map(p => preset.effect(p, context)))
  const notify = vi.fn()
  const unsubscribe = registry.subscribe(notify)
  try {
    expect(before.map(preset => preset.id).sort()).toEqual(Object.keys(german).sort())
    for (const locale of ['en', 'de', 'en'] as const) {
      await activateLocale(locale)
      expect(registry.list()).toBe(before)
      before.forEach((preset, index) => {
        const label = locale === 'de' ? german[preset.id] : english[index]
        expect(preset.label).toBe(label)
        expect(presetLabel(slot, preset.id)).toBe(label)
        expect(registry.get(preset.id)).toBe(preset)
        expect(preset.defaults).toBe(defaults[index])
        expect(preset.effect).toBe(effects[index])
        expect([0, 0.5, 1].map(p => preset.effect(p, context))).toEqual(frames[index])
      })
    }
    expect(notify).not.toHaveBeenCalled()
  } finally {
    unsubscribe()
  }
})

it('preserves direct assignments to every built-in Enter, Exit and Emphasis label', async () => {
  for (const preset of [...inOutPresets.list(), ...emphasisPresets.list()]) {
    const descriptor = Object.getOwnPropertyDescriptor(preset, 'label')!
    try {
      preset.label = `Extension {name}.png: ${preset.id}`
      for (const locale of ['de', 'en'] as const) {
        await activateLocale(locale)
        expect(preset.label).toBe(`Extension {name}.png: ${preset.id}`)
      }
    } finally {
      Object.defineProperty(preset, 'label', descriptor)
    }
  }
})

it('retains custom animation labels and replacement registrations when switching languages', async () => {
  const enter = inOutPresets.get('fade')!
  const emphasis = emphasisPresets.get('wiggle')!
  const replacementEnter = { ...enter, label: 'Replacement {title}.png' }
  const replacementEmphasis = { ...emphasis, label: 'Replacement emphasis' }
  const customEnter = { ...enter, id: 'custom.enter', label: 'User Enter' }
  const customEmphasis = { ...emphasis, id: 'custom.emphasis', label: 'User Emphasis' }
  const disposeEnter = registerInOutPreset(customEnter)
  const disposeEmphasis = registerEmphasisPreset(customEmphasis)
  registerInOutPreset(replacementEnter)
  registerEmphasisPreset(replacementEmphasis)
  try {
    replacementEmphasis.label = 'Assigned replacement'
    for (const locale of ['en', 'de', 'en'] as const) {
      await activateLocale(locale)
      expect(inOutPresets.get('fade')).toBe(replacementEnter)
      expect(emphasisPresets.get('wiggle')).toBe(replacementEmphasis)
      expect(presetLabel('enter', 'fade')).toBe('Replacement {title}.png')
      expect(presetLabel('exit', 'fade')).toBe('Replacement {title}.png')
      expect(presetLabel('emphasis', 'wiggle')).toBe('Assigned replacement')
      expect(presetLabel('enter', customEnter.id)).toBe('User Enter')
      expect(presetLabel('emphasis', customEmphasis.id)).toBe('User Emphasis')
      expect(presetLabel('exit', 'future.preset')).toBe('future.preset')
    }
  } finally {
    registerInOutPreset(enter)
    registerEmphasisPreset(emphasis)
    disposeEnter()
    disposeEmphasis()
  }
})

it('switches every built-in transition label without changing registry identity or effects', async () => {
  const before = transitionPresets.list()
  const english = before.map(preset => preset.label)
  const defaults = before.map(preset => preset.defaults)
  const effects = before.map(preset => preset.compose)
  const frames = before.map(preset => preset.compose(0.5, preset.defaults.direction))
  const notify = vi.fn()
  const unsubscribe = transitionPresets.subscribe(notify)
  try {
    await activateLocale('de')
    expect(before.map(preset => [preset.id, preset.label])).toEqual(Object.entries(germanTransitions))
    await activateLocale('en')
    expect(before.map(preset => preset.label)).toEqual(english)
    expect(transitionPresets.list()).toBe(before)
    before.forEach((preset, index) => {
      expect(transitionPresets.get(preset.id)).toBe(preset)
      expect(preset.defaults).toBe(defaults[index])
      expect(preset.compose).toBe(effects[index])
      expect(preset.compose(0.5, preset.defaults.direction)).toEqual(frames[index])
    })
    expect(notify).not.toHaveBeenCalled()
  } finally {
    unsubscribe()
  }
})

it('retains assigned labels and extension replacements across language changes', async () => {
  const push = transitionPresets.get('push')!
  const rise = inOutPresets.get('rise')!
  const pushLabel = Object.getOwnPropertyDescriptor(push, 'label')!
  const riseLabel = Object.getOwnPropertyDescriptor(rise, 'label')!
  const fade = transitionPresets.get('fade')!
  const replacement = { ...fade, label: 'Extension {title}.png' }
  const custom = { ...fade, id: 'custom.transition', label: 'User transition' }
  const dispose = registerTransitionPreset(custom)
  registerTransitionPreset(replacement)
  try {
    push.label = 'Assigned {name}'
    rise.label = 'Assigned rise'
    replacement.label = 'Assigned replacement'
    for (const locale of ['de', 'en'] as const) {
      await activateLocale(locale)
      expect(push.label).toBe('Assigned {name}')
      expect(rise.label).toBe('Assigned rise')
      expect(transitionPresets.get('fade')).toBe(replacement)
      expect(replacement.label).toBe('Assigned replacement')
      expect(transitionPresets.get(custom.id)).toBe(custom)
      expect(custom.label).toBe('User transition')
    }
  } finally {
    Object.defineProperty(push, 'label', pushLabel)
    Object.defineProperty(rise, 'label', riseLabel)
    registerTransitionPreset(fade)
    dispose()
  }
})

it('names Rise for its fade-in movement from below while keeping its preset id and timing', async () => {
  const rise = inOutPresets.get('rise')!
  const object = rectObject('User {name}', 400, 300, { enter: { preset: 'rise', delayMs: 0, durationMs: 700, easing: 'linear' } })
  const middle = sampleObject(object, 350, { width: 800, height: 600 })
  expect(middle.ty).toBeGreaterThan(0)
  expect(middle.opacity).toBeCloseTo(0.5)
  await activateLocale('de')
  expect(rise.label).toBe('Von unten einblenden')
  expect(rise.id).toBe('rise')
  expect(rise.defaults).toEqual({ durationMs: 700, easing: 'ease-out' })
  expect(sampleObject(object, 350, { width: 800, height: 600 })).toEqual(middle)
  await activateLocale('en')
  expect(rise.label).toBe('Rise')
})
