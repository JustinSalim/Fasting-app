'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

interface ProfileUpdateFields {
  full_name?: string
  birth_date?: string | null
  min_fasting_threshold_minutes?: number
  reminder_offset_minutes?: number
  weight_unit?: 'kg' | 'lb'
}

const ALLOWED_PROFILE_UPDATE_KEYS = [
  'full_name',
  'birth_date',
  'min_fasting_threshold_minutes',
  'reminder_offset_minutes',
  'weight_unit',
] as const satisfies readonly (keyof ProfileUpdateFields)[]

export async function updateProfile(fields: ProfileUpdateFields) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  // Build an explicit allow-listed update object instead of forwarding the
  // caller's object directly into `.update()`. `ProfileUpdateFields` is only
  // a compile-time contract — a request crafted directly against this server
  // action's endpoint could otherwise include arbitrary extra keys and have
  // them written to the caller's own `profiles` row (mass assignment).
  const update: Partial<Record<(typeof ALLOWED_PROFILE_UPDATE_KEYS)[number], unknown>> = {}
  for (const key of ALLOWED_PROFILE_UPDATE_KEYS) {
    if (key in fields) {
      update[key] = fields[key]
    }
  }

  const { error } = await supabase.from('profiles').update(update).eq('id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/settings', 'page')
  revalidatePath('/dashboard', 'layout')
  return { success: true as const }
}

export async function uploadAvatar(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const file = formData.get('avatar')
  if (!(file instanceof File)) return { error: 'No file provided' }

  const { data: currentProfile } = await supabase
    .from('profiles')
    .select('avatar_url')
    .eq('id', user.id)
    .single()
  const oldPath = currentProfile?.avatar_url?.split('/avatars/')[1]

  const ext = file.name.split('.').pop() || 'jpg'
  const path = `${user.id}/avatar-${Date.now()}.${ext}`

  const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
  if (uploadError) return { error: uploadError.message }

  const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(path)

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ avatar_url: publicUrlData.publicUrl })
    .eq('id', user.id)
  if (updateError) return { error: updateError.message }

  if (oldPath) {
    await supabase.storage.from('avatars').remove([oldPath])
  }

  revalidatePath('/settings', 'page')
  revalidatePath('/dashboard', 'layout')
  return { success: true as const, url: publicUrlData.publicUrl }
}
