/**
 * Writing systems the font picker can filter by. `id` is the script name the font catalogue uses (Fontsource's
 * subset names); `sample` is a short word shown beside each font name, set in that font, so it is clear at a glance
 * that the font has the letters.
 */

export interface ScriptInfo {
  id: string
  label: string
  sample: string
  letters: RegExp
}

/** Chinese characters: the same letters for all three Chinese entries, whose fonts differ in the forms they carry. */
const HAN = /[\u3400-\u4DBF\u4E00-\u9FFF]/u

export const SCRIPTS: readonly ScriptInfo[] = [
  { id: 'arabic', label: 'Arabic', sample: 'أبجد هوز', letters: /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/u },
  { id: 'hebrew', label: 'Hebrew', sample: 'אבגד', letters: /[\u0590-\u05FF\uFB1D-\uFB4F]/u },
  { id: 'bengali', label: 'Bangla', sample: 'বাংলা', letters: /\p{Script=Bengali}/u },
  { id: 'devanagari', label: 'Devanagari (Hindi)', sample: 'हिन्दी', letters: /\p{Script=Devanagari}/u },
  { id: 'thai', label: 'Thai', sample: 'ภาษาไทย', letters: /[\u0E00-\u0E7F]/u },
  { id: 'tamil', label: 'Tamil', sample: 'தமிழ்', letters: /[\u0B80-\u0BFF]/u },
  { id: 'gujarati', label: 'Gujarati', sample: 'ગુજરાતી', letters: /[\u0A80-\u0AFF]/u },
  { id: 'cyrillic', label: 'Cyrillic', sample: 'Кириллица', letters: /[\u0400-\u04FF]/u },
  { id: 'greek', label: 'Greek', sample: 'Ελληνικά', letters: /[\u0370-\u03FF]/u },
  { id: 'vietnamese', label: 'Vietnamese', sample: 'Tiếng Việt', letters: /[\u1EA0-\u1EF9\u01A0\u01A1\u01AF\u01B0]/u },
  { id: 'japanese', label: 'Japanese', sample: 'ひらがな', letters: /[\u3040-\u30FF]/u },
  { id: 'korean', label: 'Korean', sample: '한국어', letters: /[\uAC00-\uD7AF\u1100-\u11FF]/u },
  { id: 'chinese-simplified', label: 'Chinese (Simplified)', sample: '简体中文', letters: HAN },
  { id: 'chinese-traditional', label: 'Chinese (Traditional)', sample: '繁體中文', letters: HAN },
  { id: 'chinese-hongkong', label: 'Chinese (Hong Kong)', sample: '香港中文', letters: HAN },
]

export type ChineseScript = 'chinese-simplified' | 'chinese-traditional' | 'chinese-hongkong'

/**
 * Which Chinese a reader most likely writes, since the characters alone don't say: the interface language
 * (`locale`) when it is Chinese, with Hong Kong and Macau taken from the browser's languages; otherwise the
 * browser's first Chinese language.
 */
export function preferredChinese(locale: string, languages: readonly string[]): ChineseScript {
  const tags = languages.map((l) => l.toLowerCase().replace(/_/g, '-'))
  const hongKong = (tag: string): boolean => /^zh-(hant-)?(hk|mo)\b/.test(tag)
  if (locale === 'zh-CN') return 'chinese-simplified'
  if (locale === 'zh-TW') return tags.some(hongKong) ? 'chinese-hongkong' : 'chinese-traditional'
  for (const tag of tags) {
    if (hongKong(tag)) return 'chinese-hongkong'
    if (/^zh-(hant|tw)\b/.test(tag)) return 'chinese-traditional'
    if (tag === 'zh' || tag.startsWith('zh-')) return 'chinese-simplified'
  }
  return 'chinese-simplified'
}

/**
 * The first non-Latin writing system in `text` that the picker knows, so it can open on fonts that have those letters.
 * Chinese characters open on `chinese` (Simplified unless the caller knows better).
 */
export function scriptOf(text: string, chinese: ChineseScript = 'chinese-simplified'): ScriptInfo | null {
  for (const ch of text) {
    const found = SCRIPTS.find((s) => s.letters.test(ch))
    if (found) return found.letters === HAN ? (scriptById(chinese) ?? found) : found
  }
  return null
}

export function scriptById(id: string): ScriptInfo | undefined {
  return SCRIPTS.find((s) => s.id === id)
}
