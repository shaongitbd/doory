import { msg } from '@/i18n/catalog'
import { Link } from 'react-router-dom'
import poster from '@/assets/landing/night-bloom-concert-poster.webp'
import sale from '@/assets/landing/bold-sale-announcement.webp'
import story from '@/assets/landing/rooftop-event-story.webp'
import styles from './HeroCards.module.css'

const CARDS = [
  { slug: 'bold-sale-announcement', src: sale, caption: "a sale post", label: "A sale post template", place: styles.left, width: 17.5, aspect: 1 },
  { slug: 'rooftop-event-story', src: story, caption: "a story", label: "An event story template", place: styles.middle, width: 15, aspect: 1080 / 1920 },
  { slug: 'night-bloom-concert-poster', src: poster, caption: "a poster", label: "A tour poster template", place: styles.right, width: 16.25, aspect: 1728 / 2304 },
]

/** Three of the starter templates, fanned out: each card opens its template. */
export function HeroCards() {
  return (
    <div className={styles.fan}>
      <ul className={styles.art}>
        {CARDS.map((card) => (
          <li key={card.slug} className={card.place} style={{ width: `${card.width}rem`, height: `${card.width / card.aspect}rem`, marginLeft: `${-card.width / 2}rem` }}>
            <Link to={`/templates/${card.slug}`} className={styles.link} aria-label={`${msg(card.label)}. Open it`}>
              <span className={styles.card}>
                <img className={styles.picture} src={card.src} alt="" width={Math.round(960 * card.aspect)} height={960} loading="eager" decoding="async" />
              </span>
              <span className={styles.caption} aria-hidden="true">
                {msg(card.caption)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
