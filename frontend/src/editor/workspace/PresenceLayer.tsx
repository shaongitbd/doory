import { useLocale } from '@/i18n/useLocale'
import { PencilLine } from 'lucide-react'
import { type CSSProperties, memo } from 'react'
import { textOn } from '../collab/colors'
import { usePresenceState } from '../collab/context'
import type { Box, Peer } from '../collab/presence'
import { t } from '../strings'
import styles from './PresenceLayer.module.css'

interface PresenceLayerProps {
  pageId: string
  zoom: number
}

const tint = (peer: Peer): CSSProperties => ({ '--peer': peer.color, '--peer-text': textOn(peer.color) }) as CSSProperties

/** Top-left corner of the axis-aligned box around a rotated box, where its name tag sits. */
function corner(box: Box): { x: number; y: number } {
  const rad = (box.a * Math.PI) / 180
  const halfW = (Math.abs(box.w * Math.cos(rad)) + Math.abs(box.h * Math.sin(rad))) / 2
  const halfH = (Math.abs(box.w * Math.sin(rad)) + Math.abs(box.h * Math.cos(rad))) / 2
  return { x: box.cx - halfW, y: box.cy - halfH }
}

function Cursor({ peer, zoom }: { peer: Peer; zoom: number }) {
  const at = peer.cursor
  if (!at) return null
  return (
    <div className={styles.cursor} style={{ ...tint(peer), transform: `translate(${at.x * zoom}px, ${at.y * zoom}px)` }} data-idle={peer.idle || undefined} data-testid="remote-cursor" data-user={peer.name}>
      <svg className={styles.arrow} width="16" height="20" viewBox="0 0 16 20" aria-hidden="true">
        <path d="M1.5 1.2v14.2l3.7-3.4 3 6.6 2.5-1.1-3-6.5 5.1-.2z" />
      </svg>
      <span className={styles.name}>{peer.name}</span>
    </div>
  )
}

function Outline({ peer, zoom }: { peer: Peer; zoom: number }) {
  const box = peer.selection?.box
  if (!box) return null
  const tag = corner(box)
  const editing = !!peer.editing && peer.selection?.ids.includes(peer.editing.id)
  return (
    <>
      <div
        className={styles.box}
        data-editing={editing || undefined}
        data-idle={peer.idle || undefined}
        data-testid="remote-selection"
        data-user={peer.name}
        style={{ ...tint(peer), left: box.cx * zoom, top: box.cy * zoom, width: Math.max(2, box.w * zoom), height: Math.max(2, box.h * zoom), transform: `translate(-50%, -50%) rotate(${box.a}deg)` }}
      />
      <span className={styles.tag} data-editing={editing || undefined} data-testid={editing ? 'text-lock-badge' : undefined} style={{ ...tint(peer), left: tag.x * zoom, top: tag.y * zoom }}>
        {editing ? <PencilLine size={11} aria-hidden="true" /> : null}
        {editing ? t.collab.presence.editingText(peer.name) : peer.name}
      </span>
    </>
  )
}

/** Other people's pointers and selections on one page, drawn over the canvas in page coordinates (so they follow zoom, pan and scroll). */
export const PresenceLayer = memo(function PresenceLayer({ pageId, zoom }: PresenceLayerProps) {
  useLocale()
  const peers = usePresenceState((s) => s.peers)
  if (!peers || peers.length === 0) return null
  const outlined = peers.filter((p) => p.selection?.pageId === pageId)
  const pointers = peers.filter((p) => p.cursor?.pageId === pageId)
  if (outlined.length === 0 && pointers.length === 0) return null
  return (
    <div className={styles.layer} aria-hidden="true">
      {outlined.map((peer) => (
        <Outline key={`s${peer.clientId}`} peer={peer} zoom={zoom} />
      ))}
      {pointers.map((peer) => (
        <Cursor key={`c${peer.clientId}`} peer={peer} zoom={zoom} />
      ))}
    </div>
  )
})
