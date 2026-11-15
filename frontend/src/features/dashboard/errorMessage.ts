import { msg } from '@/i18n/catalog'
import { isApiError } from '@/lib/api'

/** A short, user-presentable description of any thrown error. */
export function errorMessage(error: unknown, fallback = 'Please try again.'): string {
  if (isApiError(error)) return error.isNetwork ? msg('You seem to be offline.') : msg(error.message)
  return msg(fallback)
}
