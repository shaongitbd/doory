import { render } from '@testing-library/react'
import { GroupIcon } from './GroupIcon'

describe('GroupIcon', () => {
  it('draws the named icon, and the fallback for a name every object has', () => {
    const icon = (slug: string, name: string) => render(<GroupIcon group={{ slug, label: 'X', icon: name, children: [], presets: [] }} />).container.querySelector('svg')
    expect(icon('custom', 'mail')).toHaveClass('lucide-mail')
    for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(icon(name, name)).toHaveClass('lucide-share-2')
    }
  })
})
