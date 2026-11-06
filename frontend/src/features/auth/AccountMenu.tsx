import { msg } from '@/i18n/catalog'
import { LayoutDashboard, LogOut, Settings } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Avatar, Menu, MenuItem, MenuLabel, MenuSeparator, useToast } from '@/ui'
import { useAuth } from './AuthProvider'
import styles from './AccountMenu.module.css'

export function AccountMenu() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()
  if (!user) return null
  const name = user.display_name || user.name || user.email

  async function signOut() {
    try {
      await logout()
      navigate('/', { replace: true })
    } catch {
      toast({ title: msg("Couldn’t sign out"), description: msg("Please try again."), variant: 'error' })
    }
  }

  return (
    <Menu
      label={msg("Account")}
      placement="bottom-end"
      trigger={
        <button type="button" className={styles.trigger} aria-label={`Account menu for ${name}`}>
          <Avatar name={name} src={user.avatar_url} size={36} />
        </button>
      }
    >
      <MenuLabel>{user.email}</MenuLabel>
      <MenuItem icon={<LayoutDashboard size={16} />} onSelect={() => navigate('/dashboard')}>
        {msg("Dashboard")}</MenuItem>
      <MenuItem icon={<Settings size={16} />} onSelect={() => navigate('/settings')}>
        {msg("Settings")}</MenuItem>
      <MenuSeparator />
      <MenuItem icon={<LogOut size={16} />} onSelect={() => void signOut()}>
        {msg("Sign out")}</MenuItem>
    </Menu>
  )
}
