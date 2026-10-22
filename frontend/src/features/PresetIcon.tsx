import { createElement } from 'react'
import {
  Badge,
  BookOpen,
  Briefcase,
  Calendar,
  Camera,
  Clapperboard,
  CreditCard,
  Ellipsis,
  FileText,
  Film,
  Gift,
  Globe,
  Image,
  Layout,
  LayoutGrid,
  Mail,
  Megaphone,
  MessageCircle,
  Monitor,
  Newspaper,
  PartyPopper,
  Presentation,
  Printer,
  RectangleHorizontal,
  RectangleVertical,
  Share2,
  ShoppingBag,
  Smartphone,
  Square,
  Tablet,
  Tag,
  Tv,
  type LucideIcon,
} from 'lucide-react'
import type { SizePreset } from '@/lib/sizePresets'

/**
 * The Lucide icons a size preset or group may name. A short list rather than all of Lucide, which would be
 * hundreds of kilobytes; a name outside it falls back to the group's icon, then to the page's shape.
 */
const PRESET_ICONS: Readonly<Record<string, LucideIcon>> = {
  badge: Badge,
  'book-open': BookOpen,
  briefcase: Briefcase,
  calendar: Calendar,
  camera: Camera,
  clapperboard: Clapperboard,
  'credit-card': CreditCard,
  ellipsis: Ellipsis,
  'file-text': FileText,
  film: Film,
  gift: Gift,
  globe: Globe,
  image: Image,
  layout: Layout,
  'layout-grid': LayoutGrid,
  mail: Mail,
  megaphone: Megaphone,
  'message-circle': MessageCircle,
  monitor: Monitor,
  newspaper: Newspaper,
  'party-popper': PartyPopper,
  presentation: Presentation,
  printer: Printer,
  'rectangle-horizontal': RectangleHorizontal,
  'rectangle-vertical': RectangleVertical,
  'share-2': Share2,
  'shopping-bag': ShoppingBag,
  smartphone: Smartphone,
  square: Square,
  tablet: Tablet,
  tag: Tag,
  tv: Tv,
}

function presetIcon(preset: SizePreset): LucideIcon {
  for (const name of [preset.icon, ...preset.path.map((group) => group.icon).reverse()]) {
    if (name && Object.hasOwn(PRESET_ICONS, name)) return PRESET_ICONS[name]
  }
  if (preset.width === preset.height) return Square
  return preset.width > preset.height ? RectangleHorizontal : RectangleVertical
}

export function PresetIcon({ preset, size, className }: { preset: SizePreset; size: number; className?: string }) {
  // The icon components are module-level constants, so picking one per render is safe.
  return createElement(presetIcon(preset), { size, className, 'aria-hidden': true })
}
