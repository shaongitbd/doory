import { Check, ImagePlus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { PageBackground } from '@/types/document'
import { useDocument, useEditor, useEditorState, useEditorStateShallow } from '../context'
import { documentColors } from '../engine/docOps'
import { useCanvasIllustrationColors } from '../hooks/useCanvasIllustrationColors'
import { gradientCss } from '../engine/objects/fills'
import { t } from '../strings'
import { Button } from '../ui/Button'
import { ColorButton } from '../ui/ColorButton'
import { Segmented } from '../ui/Segmented'
import { GRADIENT_PRESETS, palettes } from '../ui/swatches'
import { loadable } from '../ui/loadable'
import { useResolvedSrc } from '../hooks/useResolvedSrc'
import ed from '../chrome/ed.module.css'
import { backgroundFill, fillToBackground } from './backgroundFill'
import { PATTERN_IDS, type PatternId, patternUrl, tileSize } from './patterns'
import styles from './Panel.module.css'

const StockTab = loadable(() => import('../drawers/StockTab').then((m) => m.StockTab))

function UploadSwatch({ src, active, onPick }: { src: string; active: boolean; onPick: () => void }) {
  const url = useResolvedSrc(src)
  return (
    <button type="button" className={`${styles.tile} ${active ? styles.chipOn : ''}`} onClick={onPick} aria-label={t.backgroundPanel.useImage} aria-pressed={active}>
      {url ? <img src={url} alt="" draggable={false} /> : null}
    </button>
  )
}

export function BackgroundPanel() {
  const editor = useEditor()
  const doc = useDocument()
  const activeId = useEditorState((s) => s.activePageId)
  const uploads = useEditorStateShallow((s) => s.uploads)
  const page = doc.pages.find((p) => p.id === activeId) ?? doc.pages[0]
  const bg = page.background
  const canvasColors = useCanvasIllustrationColors()
  const docColors = useMemo(() => documentColors(doc, 12), [doc])
  const preset = palettes.get('doory')?.colors ?? []
  const colors = [...new Set([...canvasColors, ...docColors, ...preset, ...(palettes.get('vivid')?.colors ?? [])])].slice(0, 18)

  const set = (b: PageBackground, key?: string): void => editor.pages.setBackground(page.id, b, key)
  const [ink, setInk] = useState('#7a64e0')
  const [paper, setPaper] = useState('#ffffff')
  const hasStock = editor.adapter.services.stock !== null
  const [stockOpen, setStockOpen] = useState(false)
  const size = editor.pageSizeOf(page.id)
  const tile = tileSize(size.width, size.height)
  const setPattern = (id: PatternId, fg = ink, bgc = paper): void => set({ type: 'image', src: patternUrl(id, fg, bgc, tile), fit: 'tile' })

  return (
    <div className={styles.panel}>
      <section className={styles.section}>
        <p className={ed.sectionTitle}>{t.panels.pageBackground}</p>
        <div className={styles.fieldRow}>
          <span className={styles.hint}>{t.backgroundPanel.custom}</span>
          <ColorButton label={t.panels.pageBackground} value={backgroundFill(bg)} onChange={(f) => set(fillToBackground(f), 'bg-fill')} />
        </div>
        <div className={styles.swatchGrid} role="group" aria-label={t.panels.swatches}>
          {colors.map((c) => (
            <button key={c} type="button" className={styles.swatchBtn} style={{ background: c }} aria-label={t.backgroundPanel.set(c)} title={c} onClick={() => set({ type: 'solid', color: c })} />
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <p className={ed.sectionTitle}>{t.panels.gradient}</p>
        <div className={`${styles.grid} ${styles.grid}`}>
          {GRADIENT_PRESETS.map((g) => (
            <button
              key={g.id}
              type="button"
              className={styles.swatchBtn}
              style={{ background: gradientCss({ type: 'gradient', kind: 'linear', angle: g.angle, stops: g.stops }), aspectRatio: '3 / 2' }}
              aria-label={t.backgroundPanel.gradientOf(g.label)}
              title={g.label}
              onClick={() => set({ type: 'gradient', kind: 'linear', angle: g.angle, stops: g.stops })}
            />
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <p className={ed.sectionTitle}>{t.backgroundPanel.patterns}</p>
        <div className={styles.fieldRow}>
          <span className={styles.hint}>{t.backgroundPanel.patternColor}</span>
          <ColorButton label={t.backgroundPanel.patternColor} value={{ type: 'solid', color: ink }} solidOnly onChange={(f) => f.type === 'solid' && setInk(f.color)} />
        </div>
        <div className={styles.fieldRow}>
          <span className={styles.hint}>{t.backgroundPanel.patternBackground}</span>
          <ColorButton label={t.backgroundPanel.patternBackground} value={{ type: 'solid', color: paper }} solidOnly onChange={(f) => f.type === 'solid' && setPaper(f.color)} />
        </div>
        <div className={styles.grid}>
          {PATTERN_IDS.map((id) => (
            <button key={id} type="button" className={styles.patternBtn} style={{ backgroundImage: `url("${patternUrl(id, ink, paper, 24)}")` }} aria-label={t.backgroundPanel.patternOf(t.backgroundPanel.patternNames[id])} title={t.backgroundPanel.patternNames[id]} data-testid={`bg-pattern-${id}`} onClick={() => setPattern(id)} />
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <p className={ed.sectionTitle}>{t.panels.image}</p>
        <Button icon={<ImagePlus size={18} />} onClick={() => void editor.insert.pickAndUpload()}>
          {t.panels.uploadImage}
        </Button>
        {hasStock ? (
          <Button variant="soft" icon={<Search size={18} />} aria-expanded={stockOpen} data-testid="bg-stock-toggle" onClick={() => setStockOpen((v) => !v)}>
            {t.imageDrawer.stock}
          </Button>
        ) : null}
        {hasStock && stockOpen ? (
          <StockTab close={() => setStockOpen(false)} onPick={(ref) => set({ type: 'image', src: ref.url, fit: bg.type === 'image' ? bg.fit : 'cover' })} />
        ) : null}
        {uploads.length > 0 ? (
          <div className={`${styles.grid} ${styles.grid2}`}>
            {uploads.map((u) => (
              <UploadSwatch key={u.id} src={u.thumbUrl || u.url} active={bg.type === 'image' && bg.src === u.url} onPick={() => set({ type: 'image', src: u.url, fit: bg.type === 'image' ? bg.fit : 'cover' })} />
            ))}
          </div>
        ) : null}
        {bg.type === 'image' ? (
          <>
            <Segmented
              label={t.panels.fit}
              value={bg.fit}
              onChange={(fit) => set({ ...bg, fit })}
              options={[
                { value: 'cover', label: t.panels.cover },
                { value: 'contain', label: t.panels.contain },
                { value: 'tile', label: t.panels.tile },
              ]}
            />
            <Button variant="ghost" onClick={() => set({ type: 'solid', color: '#ffffff' })}>
              {t.panels.removeBackgroundImage}
            </Button>
          </>
        ) : null}
      </section>

      <Button variant="soft" icon={<Check size={18} />} disabled={doc.pages.length < 2} onClick={() => editor.pages.setBackgroundAll(page.background)}>
        {t.panels.applyToAll}
      </Button>
    </div>
  )
}
