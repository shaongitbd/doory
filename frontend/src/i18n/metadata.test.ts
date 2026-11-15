import { writableMetadata } from './metadata'

it('keeps the original object and supports explicit assignments, including undefined', () => {
  let label = 'English'
  const metadata = { get label() { return label }, get description(): string | undefined { return label } }
  const original = writableMetadata(metadata)
  expect(original).toBe(metadata)
  label = 'Deutsch'
  expect(metadata.label).toBe('Deutsch')
  Object.assign(metadata, { label: 'Extension {label}', description: undefined })
  label = 'English'
  expect(metadata.label).toBe('Extension {label}')
  expect(metadata.description).toBeUndefined()
  expect(Object.keys(metadata)).toEqual(['label', 'description'])
})

it('assigns on the receiving object and retains existing setters and plain values', () => {
  const set = vi.fn()
  const metadata = writableMetadata({ get label() { return 'Built-in' }, get title() { return 'Title' }, set title(value: string) { set(value) }, id: 'machine.id' })
  const child = Object.create(metadata)
  child.label = 'Child extension'
  expect(child.label).toBe('Child extension')
  expect(metadata.label).toBe('Built-in')
  metadata.title = 'Custom title'
  expect(set).toHaveBeenCalledWith('Custom title')
  metadata.id = 'custom.id'
  expect(metadata.id).toBe('custom.id')
})
