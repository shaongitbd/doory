import { describe, expect, it } from 'vitest'
import { DoryLine } from './DoryLine'

function svgOf(options: Record<string, unknown> = {}): Document {
  const line = new DoryLine({ width: 200, stroke: '#112233', strokeWidth: 4, ...options })
  return new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${line.toSVG()}</svg>`, 'image/svg+xml')
}

describe('DoryLine as SVG', () => {
  it('is valid XML with the stroke on the line', () => {
    const svg = svgOf()
    expect(svg.querySelector('parsererror')).toBeNull()
    const line = svg.querySelector('line')
    expect(line?.getAttribute('x1')).toBe('-100')
    expect(line?.getAttribute('style')).toContain('stroke: rgb(17,34,51)')
    expect(svg.documentElement.outerHTML).not.toContain('COMMON_PARTS')
  })

  it('draws the arrow heads, solid or open, at their ends', () => {
    const paths = [...svgOf({ arrowStart: 'open', arrowEnd: 'triangle' }).querySelectorAll('path')]
    expect(paths.map((p) => p.getAttribute('transform'))).toEqual(['translate(-100 0) rotate(180)', 'translate(100 0) rotate(0)'])
    expect(paths.map((p) => p.getAttribute('fill'))).toEqual(['none', '#112233'])
  })

  it('has no heads when there are none, and a colour cannot break out of its attribute', () => {
    expect(svgOf().querySelectorAll('path')).toHaveLength(0)
    const svg = svgOf({ arrowEnd: 'triangle', stroke: '"/><script/>' })
    expect(svg.querySelector('parsererror')).toBeNull()
    expect(svg.querySelector('script')).toBeNull()
  })
})
