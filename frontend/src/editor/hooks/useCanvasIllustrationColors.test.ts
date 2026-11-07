import type { DocPage } from '@/types/document'
import { canvasIllustrationColors } from './useCanvasIllustrationColors'

it('reuses the current colors of editable SVG shapes and ignores image objects', () => {
  const page: DocPage = {
    id: 'page',
    background: { type: 'solid', color: '#ffffff' },
    objects: [
      { id: 'bitmap', type: 'image', src: 'art.png' },
      {
        id: 'illustration', type: 'group', elementId: 'upload:figure',
        colorMap: { '#ff0000': '#89c5cc' },
        objects: [
          { origFill: '#ff0000', width: 30, height: 30 },
          { origFill: '#191847', width: 10, height: 10 },
        ],
      },
      { id: 'new-shape', type: 'rect', fill: '#7a64e0' },
    ],
  }

  expect(canvasIllustrationColors(page)).toEqual(['#89c5cc', '#191847'])
  page.objects[1].visible = false
  expect(canvasIllustrationColors(page)).toEqual([])
})

it('offers gradient stop colors for reuse on another object', () => {
  const page: DocPage = {
    id: 'page',
    background: { type: 'solid', color: '#ffffff' },
    objects: [{
      id: 'illustration', type: 'group', elementId: 'upload:figure',
      colorMap: { '#ff0000': { type: 'gradient', kind: 'linear', angle: 45, stops: [
        { offset: 0, color: '#ff0000' }, { offset: 1, color: '#0000ff' },
      ] } },
      objects: [{ origFill: '#ff0000', width: 30, height: 30 }],
    }],
  }
  expect(canvasIllustrationColors(page)).toEqual(['#ff0000', '#0000ff'])
})
