import { msg } from '@/i18n/catalog'
import { MailWarning } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '@/features/auth/AuthProvider'
import { rateLimitMessage } from '@/features/auth/errors'
import { authApi, isApiError } from '@/lib/api'
import { Button, useToast } from '@/ui'
import styles from './VerifyEmailBanner.module.css'

/** Shown to signed-in users whose email isn't verified yet (only when the server sends verification mails). */
export function VerifyEmailBanner() {
  const { user, config } = useAuth()
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  if (!user || user.is_email_verified || !config.features.email_verification) return null

  async function resend() {
    setBusy(true)
    try {
      await authApi.resendVerification()
      setSent(true)
      toast({ title: msg("Verification email sent"), description: `Check ${user?.email} for the link.`, variant: 'success' })
    } catch (error) {
      toast({ title: msg("Couldn’t send the email"), description: isApiError(error) && error.isRateLimited ? rateLimitMessage(error.retryAfter) : 'Please try again shortly.', variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.banner} role="status">
      <MailWarning size={18} aria-hidden="true" />
      <p className={styles.text}>
        <strong>{msg("Verify your email.")}</strong> {msg("We sent a link to ")}{user.email}{msg(". Confirm it to keep your account recoverable.")}</p>
      <Button size="sm" variant="secondary" loading={busy} disabled={sent} onClick={() => void resend()}>
        {sent ? 'Email sent' : 'Resend email'}
      </Button>
    </div>
  )
}
