import { registerToolbarSection } from '../toolbar/registry'
import { ActionsSection, AlignSection, FlipRotateSection, GroupSection, MultiSection, ZOrderSection } from '../toolbar/sections/common'
import { elementColors, onlyKind } from '../toolbar/kinds'
import { CropSection } from '../toolbar/sections/crop'
import { ImageSection } from '../toolbar/sections/image'
import { PageSection } from '../toolbar/sections/page'
import { ElementSection, LineSection, PlaceholderSection, QrSection, ShapeSection } from '../toolbar/sections/shapes'
import { TextSection } from '../toolbar/sections/text'
import { loadable } from '../ui/loadable'

// Only needed once a video clip is selected: its code comes with the first one.
const ClipSection = loadable(() => import('../toolbar/sections/clip').then((m) => m.ClipSection), { fallback: null })

/**
 * The contextual row, in this order: what is specific to the kind, then flip and rotate, order,
 * centre on the page, and lock / duplicate / delete. Each group is one section; sections that do not apply
 * (text has no flip or order group) are skipped and separators follow the groups shown. With nothing
 * selected the row shows the page's colour and actions, so the workspace below it never moves when a selection starts.
 */
export function registerBuiltinToolbarSections(): void {
  const selected = (ids: readonly string[], cropping: unknown): boolean => ids.length > 0 && cropping === null
  registerToolbarSection({ id: 'crop', order: 0, appliesTo: (_s, state) => state.ui.cropping !== null, component: CropSection })
  registerToolbarSection({ id: 'page', order: 10, appliesTo: (sel, state) => sel.ids.length === 0 && state.ui.cropping === null, component: PageSection })
  registerToolbarSection({ id: 'text', order: 10, appliesTo: (sel) => onlyKind(sel.kinds, 'text'), component: TextSection })
  registerToolbarSection({ id: 'shape', order: 10, appliesTo: (sel) => onlyKind(sel.kinds, 'shape') && sel.ids.length === 1, component: ShapeSection })
  registerToolbarSection({ id: 'line', order: 10, appliesTo: (sel) => onlyKind(sel.kinds, 'line') && sel.ids.length === 1, component: LineSection })
  registerToolbarSection({ id: 'image', order: 10, appliesTo: (sel) => onlyKind(sel.kinds, 'image') && sel.ids.length === 1, component: ImageSection })
  registerToolbarSection({ id: 'video', order: 10, appliesTo: (sel) => onlyKind(sel.kinds, 'video') && sel.ids.length === 1, component: ClipSection })
  registerToolbarSection({ id: 'element', order: 10, appliesTo: (sel) => onlyKind(sel.kinds, 'element') && sel.ids.length === 1 && elementColors(sel.objects[0]).length > 0, component: ElementSection })
  registerToolbarSection({ id: 'qr', order: 10, appliesTo: (sel) => onlyKind(sel.kinds, 'qr'), component: QrSection })
  registerToolbarSection({ id: 'placeholder', order: 10, appliesTo: (sel) => onlyKind(sel.kinds, 'placeholder') && sel.ids.length === 1, component: PlaceholderSection })
  registerToolbarSection({ id: 'group', order: 10, appliesTo: (sel) => onlyKind(sel.kinds, 'group') && sel.ids.length === 1, component: GroupSection })
  registerToolbarSection({ id: 'multi', order: 10, appliesTo: (sel) => sel.ids.length > 1, component: MultiSection })
  registerToolbarSection({ id: 'flip', order: 60, appliesTo: (sel, state) => selected(sel.ids, state.ui.cropping) && !onlyKind(sel.kinds, 'text'), component: FlipRotateSection })
  registerToolbarSection({ id: 'zorder', order: 70, appliesTo: (sel, state) => selected(sel.ids, state.ui.cropping) && !onlyKind(sel.kinds, 'text'), component: ZOrderSection })
  registerToolbarSection({ id: 'align', order: 80, appliesTo: (sel, state) => selected(sel.ids, state.ui.cropping), component: AlignSection })
  registerToolbarSection({ id: 'actions', order: 90, appliesTo: (sel, state) => selected(sel.ids, state.ui.cropping), component: ActionsSection })
}

registerBuiltinToolbarSections()
