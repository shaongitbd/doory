import { useId, type ReactNode } from 'react'
import { cx } from '@/lib/cx'
import { useControllableState } from './hooks'
import styles from './RadioGroup.module.css'

export interface RadioOption<T extends string> {
  value: T
  label: ReactNode
  description?: ReactNode
  disabled?: boolean
}

export interface RadioGroupProps<T extends string> {
  legend: ReactNode
  options: RadioOption<T>[]
  value?: T
  defaultValue?: T
  onChange?: (value: T) => void
  name?: string
  orientation?: 'vertical' | 'horizontal'
  hideLegend?: boolean
  className?: string
}

/** Native radios (arrow-key navigation for free) with a custom visual. */
export function RadioGroup<T extends string>({ legend, options, value, defaultValue, onChange, name, orientation = 'vertical', hideLegend, className }: RadioGroupProps<T>) {
  const autoName = useId()
  const [current, setCurrent] = useControllableState<T | undefined>(value, defaultValue, onChange as ((next: T | undefined) => void) | undefined)
  return (
    <fieldset className={cx(styles.group, className)} data-orientation={orientation}>
      <legend className={cx(styles.legend, hideLegend && styles.hidden)}>{legend}</legend>
      <div className={styles.options}>
        {options.map((option) => {
          const id = `${autoName}-${option.value}`
          return (
            <div key={option.value} className={styles.option}>
              <span className={styles.radio}>
                <input
                  id={id}
                  type="radio"
                  name={name ?? autoName}
                  value={option.value}
                  className={styles.input}
                  checked={current === option.value}
                  disabled={option.disabled}
                  onChange={() => setCurrent(option.value)}
                  aria-describedby={option.description ? `${id}-desc` : undefined}
                />
                <span className={styles.visual} aria-hidden="true" />
              </span>
              <span className={styles.text}>
                <label htmlFor={id} className={styles.label}>
                  {option.label}
                </label>
                {option.description ? (
                  <span id={`${id}-desc`} className={styles.description}>
                    {option.description}
                  </span>
                ) : null}
              </span>
            </div>
          )
        })}
      </div>
    </fieldset>
  )
}
