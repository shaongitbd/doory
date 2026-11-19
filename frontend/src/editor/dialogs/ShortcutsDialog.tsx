import { useLocale } from '@/i18n/useLocale'
import { useState, useSyncExternalStore } from 'react'
import { commands } from '../commands'
import { useEditor } from '../context'
import { formatShortcut } from '../shortcuts'
import { t } from '../strings'
import { Dialog } from '../ui/Dialog'
import styles from './dialogs.module.css'

/** "←", "→", "↑", "↓" (or "Shift+←" …) become one key cap: "←→↑↓" or "Shift+←→↑↓". */
function compactKeys(keys: string[]): string[] {
  if (keys.length < 2) return keys
  const split = keys.map((k) => {
    const at = k.lastIndexOf('+')
    return at < 0 ? ['', k] : [k.slice(0, at + 1), k.slice(at + 1)]
  })
  const prefix = split[0][0]
  const arrows = split.every(([p, key]) => p === prefix && '←→↑↓'.includes(key) && key.length === 1)
  return arrows ? [prefix + split.map(([, key]) => key).join('')] : keys
}

export function ShortcutsDialog() {
  useLocale()
  const editor = useEditor()
  const all = useSyncExternalStore(commands.subscribe, commands.getSnapshot)
  const [filter, setFilter] = useState('')
  const groups = (() => {
    const needle = filter.trim().toLowerCase()
    const map = new Map<string, { label: string; keys: string[] }[]>()
    for (const c of all) {
      if (!c.shortcut) continue
      if (needle && !c.label.toLowerCase().includes(needle) && !formatShortcut(c.shortcut).toLowerCase().includes(needle)) continue
      const g = c.group ?? t.menuMisc.otherGroup
      const rows = map.get(g) ?? []
      // Commands that share a name (the four arrow-key nudges) are one row with all their keys.
      const same = rows.find((r) => r.label === c.label)
      if (same) same.keys.push(...c.shortcut.split('|'))
      else rows.push({ label: c.label, keys: c.shortcut.split('|') })
      map.set(g, rows)
    }
    return [...map.entries()].map(([group, rows]) => [group, rows.map((r) => ({ label: r.label, keys: compactKeys(r.keys.map((k) => formatShortcut(k))) }))] as const)
  })()
  return (
    <Dialog title={t.dialog.shortcutsTitle} onClose={() => editor.closeDialog()} width={640}>
      <input className={styles.filter} type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t.dialog.shortcutsFilter} aria-label={t.dialog.shortcutsFilter} data-autofocus />
      <div className={styles.shortcutGrid}>
        {groups.map(([group, items]) => (
          <section key={group} className={styles.shortcutGroup}>
            <h3>{group}</h3>
            <dl>
              {items.map((i) => (
                <div key={i.label} className={styles.shortcutRow}>
                  <dt>{i.label}</dt>
                  <dd>
                    {i.keys.map((key) => (
                      <kbd key={key}>{key}</kbd>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
        {groups.length === 0 ? <p className={styles.muted}>{t.panels.noResults}</p> : null}
      </div>
      <p className={styles.muted}>{t.menuMisc.shortcutsHint}</p>
    </Dialog>
  )
}
