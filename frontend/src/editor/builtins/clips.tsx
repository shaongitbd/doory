import { registerTimelineSection } from '../animation/sections'
import { pageHoldEndMs } from '../animation/timelineMath'
import { pageClipTiming } from '../clips/model'
import { loadable } from '../ui/loadable'

// The rows come with the timeline's own chunk (it is loaded on first use), not before.
const ClipsSection = loadable(() => import('../workspace/TimelineClips').then((m) => m.ClipsSection), { fallback: null })

/** The video rows of the timeline (see `workspace/TimelineClips.tsx`): above the audio rows, below the animated elements. */
export function registerBuiltinClips(): void {
  registerTimelineSection({
    id: 'video',
    order: 50,
    Section: ClipsSection,
    preload: () => ClipsSection.preload(),
    // A clip plays to its end, or for as long as the page is up when it loops.
    extentMs: (page) => (pageClipTiming(page).count > 0 ? Math.max(pageClipTiming(page).endMs, pageHoldEndMs(page)) : 0),
    hasContent: (page) => pageClipTiming(page).count > 0,
  })
}

registerBuiltinClips()
