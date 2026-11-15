import './commands'
import './panels'
import '../animation/commands'
import '../presenter/commands'
import '../panels/commentsCommands'
import '../engine/objects/builtinKinds'
import '../engine/export/formats'
import '../engine/export/video/formats'
import { activateLocale } from '@/i18n/catalog'
import { setLocale } from '@/i18n/locale'
import { commands, registerCommand } from '../commands'
import { panels, registerPanel } from '../panels/registry'
import { objectKinds, registerObjectKind } from '../engine/objects/kinds'
import { exportFormats, registerExportFormat } from '../engine/export/registry'
import { FILTER_PRESETS } from '../engine/objects/filters'
import { PATH_SHAPES } from '../engine/objects/shapeGeometry'

afterEach(() => setLocale('en'))

it.each([
  ['commands', commands.list()],
  ['panels', panels.list()],
  ['object kinds', objectKinds.list()],
  ['export formats', exportFormats.list()],
  ['filters', FILTER_PRESETS],
  ['path shapes', PATH_SHAPES],
] as const)('preserves assignment compatibility for all lazy %s metadata', async (_name, entries) => {
  let checked = 0
  for (const entry of entries) {
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(entry))) {
      if (!descriptor.get) continue
      checked++
      const sentinel = `Extension {name}.png: ${entry.id}/${key}`
      try {
        expect(Reflect.set(entry, key, sentinel)).toBe(true)
        await activateLocale('de')
        expect(Reflect.get(entry, key)).toBe(sentinel)
        await activateLocale('en')
        expect(Reflect.get(entry, key)).toBe(sentinel)
      } finally {
        Object.defineProperty(entry, key, descriptor)
      }
    }
  }
  expect(checked).toBeGreaterThan(0)
})

it('keeps video descriptions reactive without re-registering formats', async () => {
  const before = exportFormats.list()
  const descriptions = before.map(format => format.description)
  const notify = vi.fn()
  const unsubscribe = exportFormats.subscribe(notify)
  try {
    await activateLocale('de')
    expect(exportFormats.get('mp4')?.description).toBe('Fast überall abspielbar.')
    expect(exportFormats.get('webm')?.description).toBe('Kleinere Videodateien.')
    expect(exportFormats.get('gif')?.description).toBe('Wird ohne Ton wiederholt.')
    await activateLocale('en')
    expect(before.map(format => format.description)).toEqual(descriptions)
    expect(exportFormats.list()).toBe(before)
    expect(notify).not.toHaveBeenCalled()
  } finally {
    unsubscribe()
  }
})

it('accepts typed direct assignments to built-in command, panel, kind and format metadata', async () => {
  const command = commands.get('file.save')!
  const panel = panels.get('elements')!
  const kind = objectKinds.get('shape')!
  const format = exportFormats.get('pdf-server')!
  const entries = [command, panel, kind, format]
  const descriptors = entries.map(entry => Object.getOwnPropertyDescriptors(entry))
  const run = command.run
  try {
    command.label = 'Custom save'
    command.group = undefined
    panel.label = 'Custom elements'
    panel.title = 'Custom title'
    kind.label = 'Custom shape'
    format.label = 'Custom PDF'
    format.description = undefined
    for (const locale of ['de', 'en'] as const) {
      await activateLocale(locale)
      expect(command.label).toBe('Custom save')
      expect(command.group).toBeUndefined()
      expect(command.run).toBe(run)
      expect(panel.label).toBe('Custom elements')
      expect(panel.title).toBe('Custom title')
      expect(kind.label).toBe('Custom shape')
      expect(format.label).toBe('Custom PDF')
      expect(format.description).toBeUndefined()
    }
  } finally {
    entries.forEach((entry, index) => Object.defineProperties(entry, descriptors[index]))
  }
})

it('reads built-in metadata in the active language without re-registering entries', async () => {
  const save = commands.get('file.save')!
  const shapes = panels.get('shapes')!
  expect(save.label).toBe('Save now')
  expect(shapes.label).toBe('Shapes')
  await activateLocale('de')
  expect(commands.get('file.save')).toBe(save)
  expect(panels.get('shapes')).toBe(shapes)
  expect(save.label).toBe('Jetzt speichern')
  expect(save.group).toBe('Datei')
  expect(shapes.label).toBe('Formen')
  await activateLocale('en')
  expect(save.label).toBe('Save now')
})

it('preserves custom entries and extension overrides when the language changes', async () => {
  const originalCommand = commands.get('file.save')!
  const originalPanel = panels.get('shapes')!
  const custom = { id: 'custom.sentinel', label: 'User {name}.png', run: vi.fn() }
  const override = { id: 'file.save', label: 'Extension-owned command', run: vi.fn() }
  const panel = { ...originalPanel, label: 'Extension-owned panel' }
  const originalKind = objectKinds.get('shape')!
  const originalFormat = exportFormats.get('png')!
  const kind = { ...originalKind, label: 'Extension-owned kind' }
  const format = { ...originalFormat, description: 'Extension-owned format' }
  const dispose = registerCommand(custom)
  registerCommand(override)
  registerPanel(panel)
  registerObjectKind(kind)
  registerExportFormat(format)
  try {
    custom.label = 'Assigned custom label'
    override.label = 'Assigned command label'
    panel.title = 'Assigned panel title'
    kind.label = 'Assigned kind label'
    format.description = 'Assigned format description'
    for (const locale of ['de', 'en'] as const) {
      await activateLocale(locale)
      expect(commands.get(custom.id)).toBe(custom)
      expect(commands.get('file.save')).toBe(override)
      expect(panels.get('shapes')).toBe(panel)
      expect(custom.label).toBe('Assigned custom label')
      expect(override.label).toBe('Assigned command label')
      expect(panel.label).toBe('Extension-owned panel')
      expect(panel.title).toBe('Assigned panel title')
      expect(objectKinds.get('shape')).toBe(kind)
      expect(exportFormats.get('png')).toBe(format)
      expect(kind.label).toBe('Assigned kind label')
      expect(format.description).toBe('Assigned format description')
    }
  } finally {
    dispose()
    registerCommand(originalCommand)
    registerPanel(originalPanel)
    registerObjectKind(originalKind)
    registerExportFormat(originalFormat)
  }
})
