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

export async function updateProfile(fields: ProfileUpdateFields) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { error } = await supabase.from('profiles').update(fields).eq('id', user.id)

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

  revalidatePath('/settings', 'page')
  revalidatePath('/dashboard', 'layout')
  return { success: true as const, url: publicUrlData.publicUrl }
}
