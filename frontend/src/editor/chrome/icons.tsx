/**
 * The editor chrome's own icon set. The glyphs the editor draws itself (typographic B / I / U,
 * "AV", "AB", "Aa", the half-filled opacity disc, the flip and centre-on-page marks…) are kept as they are so
 * the toolbar reads the same; everything else falls back to lucide icons at the same 18 px / 2 px stroke.
 */
import type { CSSProperties, ReactElement } from 'react'

const stroke = { fill: 'none', stroke: 'currentColor' } as const
const glyph: CSSProperties = { fontFamily: 'var(--font-sans)' }

function svg(size: number, strokeWidth: number, children: ReactElement | ReactElement[], extra: { viewBox?: string; width?: number } = {}): ReactElement {
  return (
    <svg width={extra.width ?? size} height={size} viewBox={extra.viewBox ?? '0 0 24 24'} {...stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  )
}

export const I = {
  back: svg(18, 2, [<path key="a" d="M19 12H5" />, <path key="b" d="m12 19-7-7 7-7" />]),
  undo: svg(16, 2, [<path key="a" d="M3 10h7" />, <path key="b" d="M3 10l5-5" />, <path key="c" d="M3 10l5 5" />, <path key="d" d="M21 20a9 9 0 0 0-9-9h-2" />]),
  redo: svg(16, 2, [<path key="a" d="M21 10h-7" />, <path key="b" d="m21 10-5-5" />, <path key="c" d="m21 10-5 5" />, <path key="d" d="M3 20a9 9 0 0 1 9-9h2" />]),
  zoomIn: svg(14, 2, [<circle key="a" cx="11" cy="11" r="8" />, <path key="b" d="m21 21-4.3-4.3" />, <path key="c" d="M11 8v6" />, <path key="d" d="M8 11h6" />]),
  zoomOut: svg(14, 2, [<circle key="a" cx="11" cy="11" r="8" />, <path key="b" d="m21 21-4.3-4.3" />, <path key="c" d="M8 11h6" />]),
  download: svg(15, 2, [<path key="a" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />, <path key="b" d="m7 10 5 5 5-5" />, <path key="c" d="M12 15V3" />]),
  text: svg(18, 2, [<path key="a" d="M4 7V4h16v3" />, <path key="b" d="M9 20h6" />, <path key="c" d="M12 4v16" />]),
  image: svg(18, 2, [<rect key="a" x="3" y="3" width="18" height="18" rx="2" />, <circle key="b" cx="8.5" cy="8.5" r="1.5" />, <path key="c" d="m21 15-5-5L5 21" />]),
  shapes: svg(18, 2, [<rect key="a" x="3" y="3" width="7" height="7" />, <circle key="b" cx="17.5" cy="6.5" r="3.5" />, <path key="c" d="m14 14 3.5 7L21 14z" />, <rect key="d" x="3" y="14" width="7" height="7" rx="1" />]),
  upload: svg(24, 1.5, [<path key="a" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />, <path key="b" d="m17 8-5-5-5 5" />, <path key="c" d="M12 3v12" />]),
  trash: svg(14, 2, [<path key="a" d="M3 6h18" />, <path key="b" d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />, <path key="c" d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />]),
  layerUp: svg(14, 2, <path d="m18 15-6-6-6 6" />),
  layerDown: svg(14, 2, <path d="m6 9 6 6 6-6" />),
  duplicate: svg(14, 2, [<rect key="a" x="8" y="8" width="14" height="14" rx="2" />, <path key="b" d="M4 16V4a2 2 0 0 1 2-2h12" />]),
  lock: svg(14, 2, [<rect key="a" x="3" y="11" width="18" height="11" rx="2" />, <path key="b" d="M7 11V7a5 5 0 0 1 10 0v4" />]),
  unlock: svg(14, 2, [<rect key="a" x="3" y="11" width="18" height="11" rx="2" />, <path key="b" d="M7 11V7a5 5 0 0 1 9.9-1" />]),
  bold: (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <text x="12" y="18" textAnchor="middle" fontSize="18" fontWeight="900" style={glyph} fill="currentColor">
        B
      </text>
    </svg>
  ),
  italic: (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <text x="12" y="18" textAnchor="middle" fontSize="18" fontStyle="italic" style={glyph} fill="currentColor">
        I
      </text>
    </svg>
  ),
  underline: (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <text x="12" y="16" textAnchor="middle" fontSize="14" fontWeight="600" style={glyph} fill="currentColor">
        U
      </text>
      <line x1="6" y1="20" x2="18" y2="20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  alignLeft: svg(18, 1.8, [<line key="a" x1="3" y1="6" x2="21" y2="6" />, <line key="b" x1="3" y1="12" x2="15" y2="12" />, <line key="c" x1="3" y1="18" x2="18" y2="18" />]),
  alignCenter: svg(18, 1.8, [<line key="a" x1="3" y1="6" x2="21" y2="6" />, <line key="b" x1="6" y1="12" x2="18" y2="12" />, <line key="c" x1="4" y1="18" x2="20" y2="18" />]),
  alignRight: svg(18, 1.8, [<line key="a" x1="3" y1="6" x2="21" y2="6" />, <line key="b" x1="9" y1="12" x2="21" y2="12" />, <line key="c" x1="6" y1="18" x2="21" y2="18" />]),
  alignJustify: svg(18, 1.8, [<line key="a" x1="3" y1="6" x2="21" y2="6" />, <line key="b" x1="3" y1="12" x2="21" y2="12" />, <line key="c" x1="3" y1="18" x2="21" y2="18" />]),
  canvasCenterH: svg(18, 1.8, [<rect key="a" x="3" y="3" width="18" height="18" rx="2" />, <line key="b" x1="12" y1="3" x2="12" y2="21" />]),
  canvasCenterV: svg(18, 1.8, [<rect key="a" x="3" y="3" width="18" height="18" rx="2" />, <line key="b" x1="3" y1="12" x2="21" y2="12" />]),
  spacing: (
    <svg width="20" height="18" viewBox="0 0 26 24" aria-hidden="true" focusable="false">
      <text x="3" y="14" fontSize="11" fontWeight="600" style={glyph} fill="currentColor">
        A
      </text>
      <text x="16" y="14" fontSize="11" fontWeight="600" style={glyph} fill="currentColor">
        V
      </text>
      <g stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <line x1="4" y1="20" x2="22" y2="20" />
        <polyline points="6,18 4,20 6,22" />
        <polyline points="20,18 22,20 20,22" />
      </g>
    </svg>
  ),
  lineHeight: svg(18, 1.5, [
    <line key="a" x1="5" y1="4" x2="5" y2="20" />,
    <polyline key="b" points="3,6 5,4 7,6" />,
    <polyline key="c" points="3,18 5,20 7,18" />,
    <line key="d" x1="11" y1="5" x2="21" y2="5" />,
    <line key="e" x1="11" y1="12" x2="21" y2="12" />,
    <line key="f" x1="11" y1="19" x2="21" y2="19" />,
  ]),
  curve: (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <text x="3" y="13" fontSize="11" fontWeight="600" style={glyph} fill="currentColor">
        A
      </text>
      <text x="14" y="13" fontSize="11" fontWeight="600" style={glyph} fill="currentColor">
        B
      </text>
      <path d="M3 19 Q12 23 21 19" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </svg>
  ),
  letterCase: (
    <svg width="20" height="18" viewBox="0 0 26 24" aria-hidden="true" focusable="false">
      <text x="3" y="17" fontSize="14" fontWeight="700" style={glyph} fill="currentColor">
        A
      </text>
      <text x="14" y="17" fontSize="14" fontWeight="500" style={glyph} fill="currentColor">
        a
      </text>
    </svg>
  ),
  opacity: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" stroke="none" />
    </svg>
  ),
  removeBg: svg(18, 1.6, [
    <rect key="a" x="3" y="3" width="18" height="18" rx="2" strokeDasharray="2.5 2" />,
    <circle key="b" cx="9" cy="9" r="1.6" fill="currentColor" stroke="none" />,
    <path key="c" d="M4 18l4-4 3.5 3.5L16 12l4 4" />,
  ]),
  upscale: svg(18, 1.7, [
    <path key="a" d="M9 4H5a1 1 0 0 0-1 1v4" />,
    <path key="b" d="M15 4h4a1 1 0 0 1 1 1v4" />,
    <path key="c" d="M20 15v4a1 1 0 0 1-1 1h-4" />,
    <path key="d" d="M9 20H5a1 1 0 0 1-1-1v-4" />,
    <path key="e" d="m9 15 6-6M15 9V7h-2" />,
  ]),
  flipH: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true" focusable="false">
      <line x1="12" y1="3" x2="12" y2="21" strokeDasharray="2 2" />
      <path d="M3 8l6-3v14L3 16z" fill="currentColor" fillOpacity="0.85" stroke="none" />
      <path d="M21 8l-6-3v14l6-3z" />
    </svg>
  ),
  flipV: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true" focusable="false">
      <line x1="3" y1="12" x2="21" y2="12" strokeDasharray="2 2" />
      <path d="M8 3l-3 6h14l-3-6z" fill="currentColor" fillOpacity="0.85" stroke="none" />
      <path d="M8 21l-3-6h14l-3 6z" />
    </svg>
  ),
  rotate: svg(17, 2, [<path key="a" d="M21 2v6h-6" />, <path key="b" d="M21 13a9 9 0 1 1-3-7.7L21 8" />]),
  sticker: svg(18, 1.7, [<path key="a" d="M15.5 3H6a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h9l6-6V8.5z" />, <path key="b" d="M15 21v-3a3 3 0 0 1 3-3h3" />]),
  search: svg(16, 2, [<circle key="a" cx="11" cy="11" r="7" />, <path key="b" d="m21 21-4.3-4.3" />]),
  chevronDown: svg(14, 2, <path d="m6 9 6 6 6-6" />),
  xClear: svg(14, 2, <path d="M18 6 6 18M6 6l12 12" />),
  canvasSize: svg(18, 2, [<rect key="a" x="3" y="5" width="18" height="14" rx="2" />, <path key="b" d="M3 12h18M12 5v14" />]),
} as const

export type IconName = keyof typeof I
