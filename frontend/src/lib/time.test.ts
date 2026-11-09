import { setLocale } from '@/i18n/locale'
import { formatBytes, formatRelative } from './time'

describe('formatRelative', () => {
  const now = Date.parse('2025-06-15T12:00:00Z')

  it('describes recent and older moments', () => {
    expect(formatRelative(now - 10_000, now)).toBe('just now')
    expect(formatRelative(now - 5 * 60_000, now)).toBe('5 minutes ago')
    expect(formatRelative(now - 3 * 3600_000, now)).toBe('3 hours ago')
    expect(formatRelative(now - 24 * 3600_000, now)).toBe('yesterday')
    expect(formatRelative(now - 10 * 24 * 3600_000, now)).toBe('last week')
    expect(formatRelative(new Date(now - 90 * 24 * 3600_000), now)).toBe('3 months ago')
  })

  it('accepts ISO strings and ignores garbage', () => {
    expect(formatRelative('2025-06-15T11:00:00Z', now)).toBe('1 hour ago')
    expect(formatRelative('not a date', now)).toBe('')
  })

  it('formats Chinese relative time with the active choice', () => {
    setLocale('zh-CN')
    expect(formatRelative(now - 10_000, now)).toBe('刚刚')
    expect(formatRelative(now - 2 * 3600_000, now)).toMatch(/2/)
    setLocale('zh-TW')
    expect(formatRelative(now - 10_000, now)).toBe('剛剛')
    setLocale('en')
  })
})

describe('formatBytes', () => {
  it('formats sizes with sensible precision', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1024)).toBe('1 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB')
    expect(formatBytes(-1)).toBe('0 B')
  })
})
