import { msg } from '@/i18n/catalog'
import { Camera, Trash2 } from 'lucide-react'
import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useAuth } from '@/features/auth/AuthProvider'
import { describeFormError } from '@/features/auth/errors'
import { authApi } from '@/lib/api'
import { formatBytes } from '@/lib/time'
import { useBlobUrl } from '@/lib/useBlobUrl'
import { Avatar, Button, Input, useToast } from '@/ui'
import { SettingsCard } from './SettingsCard'
import styles from './Settings.module.css'

const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp']

export function ProfileSection() {
  const { user, config, setUser } = useAuth()
  const { toast } = useToast()
  const [name, setName] = useState(user?.display_name ?? '')
  const [savingName, setSavingName] = useState(false)
  const [nameError, setNameError] = useState('')
  const [pending, setPending] = useState<File | null>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoError, setPhotoError] = useState('')
  const picker = useRef<HTMLInputElement>(null)
  const previewUrl = useBlobUrl(pending)
  if (!user) return null
  const shownName = user.display_name || user.name || user.email

  function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setPhotoError('')
    if (!AVATAR_TYPES.includes(file.type)) {
      setPhotoError('Choose a PNG, JPG or WebP image.')
      return
    }
    if (file.size > config.limits.max_upload_bytes) {
      setPhotoError(`That photo is ${formatBytes(file.size)}. The limit is ${formatBytes(config.limits.max_upload_bytes)}.`)
      return
    }
    setPending(file)
  }

  async function savePhoto() {
    if (!pending) return
    setPhotoBusy(true)
    setPhotoError('')
    try {
      const result = await authApi.uploadAvatar(pending, pending.name)
      setUser(result.user)
      setPending(null)
      toast({ title: msg("Profile photo updated"), variant: 'success' })
    } catch (error) {
      setPhotoError(describeFormError(error, ['avatar']).fields.avatar ?? describeFormError(error, ['avatar']).message)
    } finally {
      setPhotoBusy(false)
    }
  }

  async function removePhoto() {
    setPhotoBusy(true)
    setPhotoError('')
    try {
      const result = await authApi.removeAvatar()
      setUser(result.user)
      toast({ title: msg("Profile photo removed") })
    } catch (error) {
      setPhotoError(describeFormError(error, []).message)
    } finally {
      setPhotoBusy(false)
    }
  }

  async function saveName(event: FormEvent) {
    event.preventDefault()
    const next = name.trim()
    if (!next) {
      setNameError('Enter the name you’d like to use.')
      return
    }
    setNameError('')
    setSavingName(true)
    try {
      const result = await authApi.updateProfile({ display_name: next })
      setUser(result.user)
      toast({ title: msg("Name updated"), variant: 'success' })
    } catch (error) {
      const failure = describeFormError(error, ['display_name'])
      setNameError(failure.fields.display_name ?? failure.message)
    } finally {
      setSavingName(false)
    }
  }

  return (
    <SettingsCard id="profile" title={msg("Profile")} description={msg("How you appear on designs you share and in comments.")}>
      <div className={styles.avatarRow}>
        <Avatar name={shownName} src={previewUrl ?? user.avatar_url} size={72} />
        <div className={styles.avatarActions}>
          <div className={styles.inline}>
            {pending ? (
              <>
                <Button size="sm" loading={photoBusy} onClick={() => void savePhoto()}>
                  {msg("Save photo")}</Button>
                <Button size="sm" variant="ghost" onClick={() => setPending(null)} disabled={photoBusy}>
                  {msg("Cancel")}</Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="secondary" leftIcon={<Camera size={14} />} onClick={() => picker.current?.click()}>
                  {user.avatar_url ? 'Change photo' : 'Upload photo'}
                </Button>
                {user.avatar_url ? (
                  <Button size="sm" variant="ghost" leftIcon={<Trash2 size={14} />} loading={photoBusy} onClick={() => void removePhoto()}>
                    {msg("Remove")}</Button>
                ) : null}
              </>
            )}
          </div>
          <input ref={picker} type="file" accept={AVATAR_TYPES.join(',')} className={styles.hiddenInput} onChange={choose} aria-label={msg("Choose a profile photo")} tabIndex={-1} />
          <p className={styles.hint}>{msg("Square photos look best. PNG, JPG or WebP.")}</p>
          {photoError ? (
            <p className={styles.error} role="alert">
              {photoError}
            </p>
          ) : null}
        </div>
      </div>
      <form className={styles.form} onSubmit={saveName} noValidate>
        <Input label={msg("Display name")} value={name} maxLength={80} autoComplete="name" onChange={(event) => setName(event.target.value)} error={nameError} />
        <div>
          <Button type="submit" loading={savingName} disabled={name.trim() === user.display_name}>
            {msg("Save name")}</Button>
        </div>
      </form>
    </SettingsCard>
  )
}
