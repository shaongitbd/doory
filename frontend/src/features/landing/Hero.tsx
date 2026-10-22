import { PenLine } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import bunny from '@/assets/bunny-sticker.webp'
import { LazyCreateDesignDialog } from '@/features/create/LazyCreateDesignDialog'
import { PresetIcon } from '@/features/PresetIcon'
import { createUrl } from '@/features/presets'
import { quickPresets, useSizePresets } from '@/lib/sizePresets'
import { Button, LinkButton } from '@/ui'
import { Doodles } from './Doodles'
import { HeroCards } from './HeroCards'
import styles from './Hero.module.css'

const PERKS = ['No watermark', 'No ads', 'Open source']

export function Hero() {
  const [customOpen, setCustomOpen] = useState(false)
  const catalogue = useSizePresets()
  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <Doodles />
      <div className={styles.stage}>
        <span className={styles.hearts} aria-hidden="true">
          <span>♥</span>
          <span>♥</span>
        </span>
        <img className={styles.bunny} src={bunny} alt="" width={523} height={713} draggable={false} />
        <span className={styles.ground} aria-hidden="true" />
        <span className={styles.bubble} aria-hidden="true">
          hi there!
        </span>
      </div>

      <h1 id="hero-title" className={styles.title}>
        Make something{' '}
        <em className={styles.accent}>
          lovely
          <svg viewBox="0 0 200 18" preserveAspectRatio="none" aria-hidden="true">
            <path d="M4 12 C 50 4, 110 4, 196 10" />
          </svg>
        </em>{' '}
        today.
      </h1>
      <p className={styles.lead}>
        Cards, posts, slides, posters and little logos, made right in your browser. Free, and no sign-up to start.
      </p>

      <HeroCards />

      <div className={styles.create}>
        <LinkButton to="/create" size="lg" rightIcon={<PenLine size={18} aria-hidden="true" />}>
          Create a design
        </LinkButton>
        <p className={styles.note} aria-hidden="true">
          it’s free, promise!
          <svg viewBox="0 0 60 44">
            <path d="M50 4 C 54 22, 40 36, 8 34 M8 34 l10 -8 M8 34 l9 8" />
          </svg>
        </p>
        <ul className={styles.perks}>
          {PERKS.map((perk) => (
            <li key={perk}>{perk}</li>
          ))}
        </ul>
      </div>

      <div className={styles.sizes}>
        <p className={styles.sizesLabel} id="hero-sizes">
          Or start with a size
        </p>
        <ul className={styles.chips} aria-labelledby="hero-sizes">
          {quickPresets(catalogue).map((preset) => (
            <li key={preset.id}>
              <Link className={styles.chip} to={createUrl({ presetId: preset.id })}>
                <PresetIcon preset={preset} size={15} />
                {preset.label}
              </Link>
            </li>
          ))}
          <li>
            <Button variant="ghost" size="sm" className={styles.customChip} onClick={() => setCustomOpen(true)}>
              Custom size…
            </Button>
          </li>
        </ul>
      </div>
      <LazyCreateDesignDialog open={customOpen} onClose={() => setCustomOpen(false)} initialTab="custom" />
    </section>
  )
}
