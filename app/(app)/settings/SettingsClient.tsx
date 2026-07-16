'use client'

import * as React from 'react'
import { useTheme } from 'next-themes'
import { LogOut } from 'lucide-react'
import { updateProfile, uploadAvatar } from '@/app/actions/profile'
import { signOut } from '@/app/(auth)/actions'
import { AccordionSection } from '@/components/settings/AccordionSection'

async function toWebp(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.85))
  return blob ? new File([blob], 'avatar.webp', { type: 'image/webp' }) : file
}

interface ProfileData {
  full_name: string | null
  avatar_url: string | null
  birth_date: string | null
  reminder_offset_minutes: number | null
  min_fasting_threshold_minutes: number | null
  weight_unit: string | null
}

export function SettingsClient({ initialProfile }: { initialProfile: ProfileData | null }) {
  const [fullName, setFullName] = React.useState(initialProfile?.full_name || '')
  const [birthDate, setBirthDate] = React.useState(initialProfile?.birth_date || '')
  const [threshold, setThreshold] = React.useState(initialProfile?.min_fasting_threshold_minutes ?? 5)
  const [reminderOffset, setReminderOffset] = React.useState(initialProfile?.reminder_offset_minutes ?? 15)
  const [weightUnit, setWeightUnit] = React.useState<'kg' | 'lb'>(
    initialProfile?.weight_unit === 'lb' ? 'lb' : 'kg'
  )
  const [avatarUrl, setAvatarUrl] = React.useState(initialProfile?.avatar_url || null)
  const [isSaving, setIsSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [avatarError, setAvatarError] = React.useState<string | null>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  const handleSave = async () => {
    setIsSaving(true)
    setError(null)
    const result = await updateProfile({
      full_name: fullName,
      birth_date: birthDate || null,
      min_fasting_threshold_minutes: threshold,
      reminder_offset_minutes: reminderOffset,
      weight_unit: weightUnit,
    })
    setIsSaving(false)
    if (!result.success) {
      setError(result.error)
    }
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarError(null)
    const webpFile = await toWebp(file)
    const formData = new FormData()
    formData.set('avatar', webpFile)
    const result = await uploadAvatar(formData)
    if (!result.success) {
      setAvatarError(result.error)
      return
    }
    setAvatarUrl(result.url)
  }

  return (
    <div className="flex flex-col flex-1 px-container-margin py-4 pb-32 gap-4">
      <header>
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-primary tracking-tighter">Settings</h1>
      </header>

      <AccordionSection title="Profile" defaultOpen>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-20 h-20 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center text-2xl font-semibold overflow-hidden self-center transition-transform hover:scale-105 active:scale-95"
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
          ) : (
            (fullName || 'U').charAt(0).toUpperCase()
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleAvatarChange}
          className="hidden"
        />
        {avatarError && <p className="font-body-md text-sm text-error text-center">{avatarError}</p>}

        <label className="flex flex-col gap-1">
          <span className="font-body-md text-sm text-on-surface-variant">Full name</span>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="bg-surface-container rounded-2xl px-4 py-3 font-body-md text-body-md text-on-surface"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-body-md text-sm text-on-surface-variant">Birth date</span>
          <input
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            className="bg-surface-container rounded-2xl px-4 py-3 font-body-md text-body-md text-on-surface"
          />
        </label>
      </AccordionSection>

      <AccordionSection title="Preferences">
        <div className="flex flex-col gap-1">
          <span className="font-body-md text-sm text-on-surface-variant">Theme</span>
          <div className="flex gap-2">
            {(['light', 'dark', 'system'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTheme(t)}
                className={`flex-1 py-2 rounded-full font-label-caps text-label-caps capitalize ${
                  mounted && theme === t
                    ? 'bg-primary-container text-on-primary-container'
                    : 'bg-surface-container text-on-surface-variant'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="font-body-md text-sm text-on-surface-variant">Weight unit</span>
          <div className="flex gap-2">
            {(['kg', 'lb'] as const).map((unit) => (
              <button
                key={unit}
                type="button"
                onClick={() => setWeightUnit(unit)}
                className={`flex-1 py-2 rounded-full font-label-caps text-label-caps ${
                  weightUnit === unit
                    ? 'bg-primary-container text-on-primary-container'
                    : 'bg-surface-container text-on-surface-variant'
                }`}
              >
                {unit.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <label className="flex flex-col gap-1">
          <span className="font-body-md text-sm text-on-surface-variant">Minimum fasting threshold (minutes)</span>
          <input
            type="number"
            min={0}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="bg-surface-container rounded-2xl px-4 py-3 font-body-md text-body-md text-on-surface"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-body-md text-sm text-on-surface-variant">Reminder offset (minutes before goal)</span>
          <input
            type="number"
            min={0}
            value={reminderOffset}
            onChange={(e) => setReminderOffset(Number(e.target.value))}
            className="bg-surface-container rounded-2xl px-4 py-3 font-body-md text-body-md text-on-surface"
          />
        </label>
      </AccordionSection>

      {error && <p className="font-body-md text-sm text-error">{error}</p>}
      <button
        type="button"
        onClick={handleSave}
        disabled={isSaving}
        className="w-full py-3 rounded-full font-label-caps text-label-caps bg-primary-container text-on-primary-container disabled:opacity-50"
      >
        {isSaving ? 'SAVING...' : 'SAVE CHANGES'}
      </button>

      <AccordionSection title="Account">
        <form action={signOut}>
          <button
            type="submit"
            className="w-full py-3 rounded-full font-label-caps text-label-caps bg-error-container text-on-error-container flex items-center justify-center gap-2"
          >
            <LogOut size={16} /> SIGN OUT
          </button>
        </form>
      </AccordionSection>
    </div>
  )
}
