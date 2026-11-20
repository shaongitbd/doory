import { msg } from '@/i18n/catalog'
import { evaluatePassword } from './password'
import styles from './PasswordStrengthMeter.module.css'

/** A strength bar and one line under it: the rule before typing, then how strong it is and what is still missing. */
export function PasswordStrengthMeter({ password }: { password: string }) {
  const strength = evaluatePassword(password)
  const missing = strength.checks.find((check) => !check.passed)
  const label = msg(strength.label)
  const line = !password ? msg('At least 8 characters, and not only numbers.') : missing ? msg('{strength}. Still needs: {rule}.', { strength: label, rule: msg(missing.label).replace(/^./u, first => first.toLowerCase()) }) : `${label}.`
  return (
    <div className={styles.root}>
      <div className={styles.bar} role="meter" aria-label={msg("Password strength")} aria-valuemin={0} aria-valuemax={4} aria-valuenow={strength.score} aria-valuetext={password ? label : msg('Empty')} data-score={strength.score}>
        {[1, 2, 3, 4].map((segment) => (
          <span key={segment} className={styles.segment} data-active={strength.score >= segment || undefined} />
        ))}
      </div>
      <p className={styles.label} aria-live="polite">
        {line}
      </p>
    </div>
  )
}
