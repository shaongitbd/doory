import {
  Badge,
  BookOpen,
  Briefcase,
  Calendar,
  Camera,
  Clapperboard,
  Code,
  CreditCard,
  Ellipsis,
  FileText,
  Gamepad2,
  Globe,
  HeartHandshake,
  Mail,
  Megaphone,
  MessageCircle,
  Monitor,
  Music,
  Newspaper,
  Palette,
  Presentation,
  Printer,
  Rocket,
  Share2,
  ShoppingBag,
  Smartphone,
  Users,
  Video,
  type LucideIcon,
} from 'lucide-react'
import { createElement } from 'react'
import type { PresetGroup } from './catalogue'
import styles from './SizePicker.module.css'

/** The Lucide names a group's `icon` may use, plus the ones below. Platforms get an icon for their kind, not a logo. */
const NAMED: Readonly<Record<string, LucideIcon>> = {
  badge: Badge,
  'book-open': BookOpen,
  briefcase: Briefcase,
  camera: Camera,
  'credit-card': CreditCard,
  ellipsis: Ellipsis,
  'file-text': FileText,
  globe: Globe,
  mail: Mail,
  megaphone: Megaphone,
  monitor: Monitor,
  presentation: Presentation,
  printer: Printer,
  'share-2': Share2,
  'shopping-bag': ShoppingBag,
  smartphone: Smartphone,
}

const KINDS: [LucideIcon, string[]][] = [
  [Camera, ['instagram', 'flickr', 'pinterest', 'snapchat', 'photo-labels']],
  [Clapperboard, ['youtube', 'tiktok', 'vimeo', 'rumble', 'twitch', 'kick']],
  [MessageCircle, ['x', 'threads', 'bluesky', 'mastodon', 'reddit', 'quora', 'tumblr', 'nextdoor', 'whatsapp', 'telegram', 'messenger', 'line', 'kakaotalk', 'viber', 'discord', 'slack']],
  [Users, ['facebook']],
  [Briefcase, ['linkedin', 'xing', 'google-business']],
  [Music, ['spotify', 'soundcloud', 'apple-music']],
  [Palette, ['behance', 'dribbble', 'deviantart']],
  [Newspaper, ['medium', 'substack', 'email']],
  [HeartHandshake, ['patreon', 'ko-fi', 'buy-me-a-coffee', 'kickstarter', 'indiegogo']],
  [Calendar, ['eventbrite', 'meetup']],
  [Code, ['github']],
  [Rocket, ['product-hunt']],
  [Gamepad2, ['steam', 'itch-io']],
  [Smartphone, ['app-store', 'google-play']],
  [ShoppingBag, ['amazon', 'ebay', 'etsy', 'shopify', 'gumroad']],
  [Megaphone, ['meta', 'google-ads', 'microsoft-ads', 'web-ads', 'posters-flyers']],
  [Video, ['zoom', 'microsoft-teams', 'google-meet']],
  [Globe, ['website']],
  [FileText, ['paper']],
  [CreditCard, ['cards']],
]
const BY_SLUG = new Map(KINDS.flatMap(([icon, slugs]) => slugs.map((slug) => [slug, icon] as const)))

/** The icon of a picker entry. */
export function GroupIcon({ group }: { group: PresetGroup }) {
  // The icon components are module-level constants, so picking one per render is safe.
  return createElement(BY_SLUG.get(group.slug) ?? NAMED[group.icon] ?? Share2, { className: styles.groupIcon, size: 18, 'aria-hidden': true })
}
