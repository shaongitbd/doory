import { describe, expect, it } from 'vitest'
import type { DocObject } from '@/types/document'
import { stillObjects } from './render'

describe('what a still of a page shows', () => {
  it('leaves out the later parts of a split clip (the page as it starts), and what is hidden', () => {
    const objects: DocObject[] = [
      { id: 'first', type: 'image', videoSrc: '/media/c.mp4', videoHideAfter: true },
      { id: 'later', type: 'image', videoSrc: '/media/c.mp4', videoHideBefore: true },
      { id: 'hidden', type: 'rect', visible: false },
      { id: 'shape', type: 'rect' },
    ]
    expect(stillObjects(objects).map((o) => o.id)).toEqual(['first', 'shape'])
  })
})
