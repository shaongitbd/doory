import { useAuth } from '@/features/auth/AuthProvider'
import { AccessibilitySection } from '@/features/settings/AccessibilitySection'
import { AiProvidersSection } from '@/features/settings/AiProvidersSection'
import { ApiTokensSection } from '@/features/settings/ApiTokensSection'
import { DangerSection } from '@/features/settings/DangerSection'
import { EmailSection } from '@/features/settings/EmailSection'
import { PasswordSection } from '@/features/settings/PasswordSection'
import { ProfileSection } from '@/features/settings/ProfileSection'
import { usePageTitle } from '@/lib/usePageTitle'
import styles from './pageStyles.module.css'
import settingsStyles from './SettingsPage.module.css'

export default function SettingsPage() {
  usePageTitle('Settings')
  const { config } = useAuth()
  const mcp = config.features.mcp === true // the MCP server is opt-in on the server
  // Users' own AI servers are opt-in too; with `staff` the section hides itself for everyone else.
  const aiProviders = config.features.ai_providers === true && (config.ai?.user_providers ?? 'off') !== 'off'
  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <h1 className={styles.title}>Settings</h1>
        <p className={styles.lead}>{mcp ? 'Manage your profile, email, security and AI assistant access.' : 'Manage your profile, email and security.'}</p>
      </header>
      <div className={settingsStyles.stack}>
        <ProfileSection />
        <EmailSection />
        <PasswordSection />
        <AccessibilitySection />
        {mcp ? <ApiTokensSection /> : null}
        {aiProviders ? <AiProvidersSection /> : null}
        <DangerSection />
      </div>
    </div>
  )
}
