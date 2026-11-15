/**
 * Registry commands of animation: the timeline, playing the page, and the Animate panel. Their ids start with `view.`
 * so they stay available in view-only and comment-only links (anyone who can see the design can play it).
 */
import { writableMetadata } from '@/i18n/metadata'
import { Clapperboard, Play, Sparkles } from 'lucide-react'
import { registerCommand } from '../commands'
import { t } from '../strings'
import { toggleTimeline } from '../workspace/timelineVisibility'
import { playbackOf } from './playback'
import { pageHasAnimation } from './model'
import { previewLengthMs } from './timelineMath'

registerCommand(writableMetadata({ id: 'view.timeline', get label() { return t.animation.cmd.timeline }, shortcut: 'Shift+T', get group() { return t.cmdGroup.view }, icon: <Clapperboard size={18} />, run: (e) => toggleTimeline(e) }))

registerCommand(writableMetadata({
  id: 'view.playPage',
  get label() { return t.animation.cmd.playPage },
  shortcut: 'Shift+Enter',
  get group() { return t.cmdGroup.view },
  icon: <Play size={18} />,
  run: (e) => {
    const page = e.getPage(e.state.activePageId)
    if (page) playbackOf(e).toggle(previewLengthMs(page))
  },
  enabled: ({ editor, state }) => {
    const page = editor.getPage(state.activePageId)
    return !!page && pageHasAnimation(page)
  },
}))

registerCommand(writableMetadata({ id: 'view.animate', get label() { return t.animation.cmd.animate }, get group() { return t.cmdGroup.view }, icon: <Sparkles size={18} />, run: (e) => e.patchUi({ panelId: e.state.ui.panelId === 'animate' ? null : 'animate' }), enabled: ({ state }) => !state.readOnly }))
