import { elementColors } from './kinds'

it('shows the ten vector colors with the largest painted bounds first', () => {
  const objects = Array.from({ length: 12 }, (_, index) => ({
    origFill: `#${index.toString(16).padStart(6, '0')}`,
    width: index + 1,
    height: 10,
  }))
  expect(elementColors({ objects })).toEqual(objects.slice(2).reverse().map((object) => object.origFill))
})

it('ignores hidden shapes and accounts for stroke coverage', () => {
  expect(elementColors({ objects: [
    { origFill: '#ff0000', width: 100, height: 100, visible: false },
    { origFill: '#0000ff', width: 10, height: 10 },
    { origStroke: '#00ff00', width: 20, height: 20, strokeWidth: 4 },
  ] })).toEqual(['#00ff00', '#0000ff'])
})
