'use client'

import * as React from 'react'
import { LogOut } from 'lucide-react'
import { updateProfile, uploadAvatar } from '@/app/actions/profile'
import { signOut } from '@/app/(auth)/actions'

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
    const formData = new FormData()
    formData.set('avatar', file)
    const result = await uploadAvatar(formData)
    if (!result.success) {
      setAvatarError(result.error)
      return
    }
    setAvatarUrl(result.url)
  }

  return (
    <div className="flex flex-col flex-1 px-container-margin py-4 pb-32 gap-6">
      <header>
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-primary tracking-tighter">Settings</h1>
      </header>

      <section className="bg-surface-container-low rounded-3xl p-5 shadow-float flex flex-col gap-4">
        <span className="font-label-caps text-label-caps text-on-surface-variant">PROFILE</span>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-20 h-20 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center text-2xl font-semibold overflow-hidden self-center"
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
      </section>

      <section className="bg-surface-container-low rounded-3xl p-5 shadow-float flex flex-col gap-4">
        <span className="font-label-caps text-label-caps text-on-surface-variant">FASTING PREFERENCES</span>

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
      </section>

      {error && <p className="font-body-md text-sm text-error">{error}</p>}
      <button
        type="button"
        onClick={handleSave}
        disabled={isSaving}
        className="w-full py-3 rounded-full font-label-caps text-label-caps bg-primary-container text-on-primary-container disabled:opacity-50"
      >
        {isSaving ? 'SAVING...' : 'SAVE CHANGES'}
      </button>

      <form action={signOut}>
        <button
          type="submit"
          className="w-full py-3 rounded-full font-label-caps text-label-caps bg-error-container text-on-error-container flex items-center justify-center gap-2"
        >
          <LogOut size={16} /> SIGN OUT
        </button>
      </form>
    </div>
  )
}
