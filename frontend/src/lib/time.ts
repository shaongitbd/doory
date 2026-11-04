import { getLocale } from '@/i18n/locale'

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
]

/** "2 hours ago", "yesterday", "just now". Accepts epoch milliseconds or an ISO string. */
export function formatRelative(value: number | string | Date, now: number = Date.now()): string {
  const then = value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value)
  if (!Number.isFinite(then)) return ''
  const seconds = Math.round((then - now) / 1000)
  const abs = Math.abs(seconds)
  if (abs < 45) return { en: 'just now', 'zh-CN': '刚刚', 'zh-TW': '剛剛' }[getLocale()]
  const formatter = new Intl.RelativeTimeFormat(getLocale(), { numeric: 'auto' })
  for (const [unit, size] of UNITS) {
    if (abs >= size) return formatter.format(Math.round(seconds / size), unit)
  }
  return formatter.format(Math.round(seconds / 60), 'minute')
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  return `${value >= 100 || Number.isInteger(value) ? Math.round(value) : value.toFixed(1)} ${units[index]}`
}
