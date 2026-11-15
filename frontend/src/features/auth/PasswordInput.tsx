import { msg } from '@/i18n/catalog'
import { Eye, EyeOff } from 'lucide-react'
import { useId, useState } from 'react'
import { IconButton, Input, type InputProps } from '@/ui'
import { PasswordStrengthMeter } from './PasswordStrengthMeter'

export interface PasswordInputProps extends Omit<InputProps, 'type' | 'rightSlot' | 'value'> {
  value: string
  /** Shows the live strength meter and rule checklist (use for new passwords). */
  showStrength?: boolean
}

export function PasswordInput({ showStrength, value, id, ...rest }: PasswordInputProps) {
  const [visible, setVisible] = useState(false)
  const autoId = useId()
  const inputId = id ?? autoId
  return (
    <div>
      <Input
        {...rest}
        id={inputId}
        value={value}
        type={visible ? 'text' : 'password'}
        spellCheck={false}
        autoCapitalize="none"
        rightSlot={<IconButton label={visible ? msg('Hide password') : msg('Show password')} size="sm" pressed={visible} icon={visible ? <EyeOff size={18} /> : <Eye size={18} />} onClick={() => setVisible((v) => !v)} />}
      />
      {showStrength ? <PasswordStrengthMeter password={value} /> : null}
    </div>
  )
}
