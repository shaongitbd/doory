/**
 * `url` as a CSS `url("…")` value, for an inline style. Quotes, backslashes and line breaks are written as CSS escapes,
 * so an address that holds one can't end the value early (and add a second picture or another declaration).
 */
export function cssUrl(url: string): string {
  return `url("${url.replace(/["\\\n\r\f]/g, (c) => `\\${c.charCodeAt(0).toString(16)} `)}")`
}
