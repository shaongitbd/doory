import { msg } from '@/i18n/catalog'
import bunny from '@/assets/bunny-sticker.webp'
import styles from './AuthBrandPanel.module.css'

/** Decorative brand side of the auth screens: the bunny with a taped-down card. Hidden below 960px. */
export function AuthBrandPanel() {
  return (
    <aside className={styles.panel} aria-label={msg("About Doory")}>
      <div className={styles.scene} aria-hidden="true">
        <div className={styles.card}>
          <span className={styles.cardHand}>{msg("a little note")}</span>
          <span className={styles.cardTitle}>
            {msg("Hello,")}<br />
            <i>{msg("friend")}</i>
          </span>
          <span className={styles.cardDots}>
            <span />
            <span />
            <span />
          </span>
        </div>
        <img className={styles.bunny} src={bunny} alt="" width={523} height={713} draggable={false} />
        <span className={styles.bubble}>{msg("welcome!")}</span>
        <svg className={styles.sparkle} width="44" height="44" viewBox="0 0 44 44">
          <path d="M22 4 C 23 16, 28 21, 40 22 C 28 23, 23 28, 22 40 C 21 28, 16 23, 4 22 C 16 21, 21 16, 22 4 Z" />
        </svg>
        <svg className={styles.heart} width="40" height="36" viewBox="0 0 46 40">
          <path d="M23 36 C 8 26, 3 18, 6 11 C 9 4, 19 4, 23 12 C 27 4, 37 4, 40 11 C 43 18, 38 26, 23 36 Z" />
        </svg>
      </div>
      <div className={styles.copy}>
        <h2 className={styles.headline}>{msg("Make something you’re proud of.")}</h2>
      </div>
    </aside>
  )
}
