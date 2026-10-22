import { describe, expect, it } from 'vitest'
import { cssUrl } from './cssUrl'

describe('cssUrl', () => {
  it('quotes an ordinary address as it is', () => {
    expect(cssUrl('/media/strip.webp')).toBe('url("/media/strip.webp")')
    expect(cssUrl('blob:https://doory.test/1f2e')).toBe('url("blob:https://doory.test/1f2e")')
  })

  it('escapes what would end the value early', () => {
    expect(cssUrl('/a") , url("/b.png')).toBe('url("/a\\22 ) , url(\\22 /b.png")')
    expect(cssUrl('/a\\b\nc')).toBe('url("/a\\5c b\\a c")')
  })
})
