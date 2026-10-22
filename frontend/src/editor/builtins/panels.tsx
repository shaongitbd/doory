import { Clapperboard, Images, LayoutTemplate, Layers, Music, PaintBucket, Palette, Shapes, Sparkles, Sticker, Type } from 'lucide-react'
import { ImageDrawer } from '../drawers/ImageDrawer'
import { ShapesDrawer } from '../drawers/ShapesDrawer'
import { TextDrawer } from '../drawers/TextDrawer'
import { BackgroundPanel } from '../panels/BackgroundPanel'
import { CommentsButtonIcon } from '../panels/CommentsButtonIcon'
import { LayersPanel } from '../panels/LayersPanel'
import { registerPanel } from '../panels/registry'
import { StickerPanel } from '../panels/StickerPanel'
import { t } from '../strings'
import { loadable } from '../ui/loadable'
import { LazyCommentPins } from '../workspace/CommentPinsLoader'

// Tools that most sessions never open live in chunks of their own: the rail entry starts
// the download when it is hovered or focused, so the panel is usually there by the time it is clicked.
const TemplatesPanel = loadable(() => import('../panels/TemplatesPanel').then((m) => m.TemplatesPanel))
const BrandPanel = loadable(() => import('../panels/BrandPanel').then((m) => m.BrandPanel))
const AnimatePanel = loadable(() => import('../panels/AnimatePanel').then((m) => m.AnimatePanel))
const AudioPanel = loadable(() => import('../panels/AudioPanel').then((m) => m.AudioPanel))
const VideosPanel = loadable(() => import('../panels/VideosPanel').then((m) => m.VideosPanel))
const CommentsPanel = loadable(() => import('../panels/CommentsPanel').then((m) => m.CommentsPanel))

/** Rail icons: lucide at 20 px, so the rail reads as one set. */
const icon = (Glyph: typeof Type) => <Glyph size={20} strokeWidth={1.8} aria-hidden="true" />

/**
 * The tools of the rail, most used first: Templates, Text, Shapes, Stickers and Images, then the rest. Every tool docks beside the rail
 * on desktop (a bottom sheet on small screens); Text, Images, Shapes and Background are `drawer` tools, whose content scrolls as one column
 * and stays open while things are added from it. Comments is an icon at the right end of the top bar.
 */
export function registerBuiltinPanels(): void {
  const editable = ({ state }: { state: { readOnly: boolean } }): boolean => !state.readOnly
  registerPanel({ id: 'templates', label: t.rail.templates, icon: icon(LayoutTemplate), order: 5, placement: 'sidebar', component: TemplatesPanel, preload: TemplatesPanel.preload, requires: editable })
  registerPanel({ id: 'text', label: t.rail.text, icon: icon(Type), order: 10, placement: 'drawer', component: TextDrawer, requires: editable, shortcut: 'T' })
  registerPanel({ id: 'shapes', label: t.rail.shapes, icon: icon(Shapes), order: 20, placement: 'drawer', component: ShapesDrawer, requires: editable })
  registerPanel({ id: 'elements', label: t.rail.elements, title: t.stickers.title, icon: icon(Sticker), order: 30, placement: 'sidebar', component: StickerPanel, requires: editable })
  registerPanel({ id: 'image', label: t.rail.image, icon: icon(Images), order: 40, placement: 'drawer', component: ImageDrawer, requires: editable })
  registerPanel({ id: 'videos', label: t.rail.videos, icon: icon(Clapperboard), order: 45, placement: 'drawer', component: VideosPanel, preload: VideosPanel.preload, requires: editable })
  registerPanel({ id: 'background', label: t.rail.background, icon: icon(PaintBucket), order: 60, placement: 'drawer', component: BackgroundPanel, requires: editable })
  registerPanel({ id: 'brand', label: t.rail.brand, icon: icon(Palette), order: 70, placement: 'sidebar', component: BrandPanel, preload: BrandPanel.preload, requires: ({ state }) => !state.readOnly && state.mode !== 'shared-edit' })
  registerPanel({ id: 'animate', label: t.rail.animate, title: t.animation.panel.title, icon: icon(Sparkles), order: 75, placement: 'sidebar', component: AnimatePanel, preload: AnimatePanel.preload, requires: editable })
  registerPanel({ id: 'audio', label: t.rail.audio, title: t.audio.title, icon: icon(Music), order: 76, placement: 'sidebar', component: AudioPanel, preload: AudioPanel.preload, readOnly: true })
  registerPanel({ id: 'layers', label: t.rail.layers, icon: icon(Layers), order: 80, placement: 'sidebar', component: LayersPanel, readOnly: true })
  registerPanel({
    id: 'comments',
    label: t.rail.comments,
    icon: <CommentsButtonIcon />,
    order: 90,
    placement: 'sidebar',
    slot: 'end',
    readOnly: true,
    component: CommentsPanel,
    preload: () => void Promise.all([CommentsPanel.preload(), LazyCommentPins.preload()]),
    // Only where someone can actually comment: an account with the comments service, or a comment link. A guest's design has
    // no Comments button (it would only lead to the sign-up dialog); signing up brings it.
    requires: ({ editor, state }) => state.mode !== 'shared-view' && (!!editor.adapter.services.comments || state.mode === 'shared-comment'),
  })
}

registerBuiltinPanels()
