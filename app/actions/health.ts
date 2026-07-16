'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function logWeight(value: number) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data, error } = await supabase
    .from('health_logs')
    .insert({ user_id: user.id, log_type: 'weight', value: String(value) })
    .select('id, value, created_at')
    .single()

  if (error) return { error: error.message }
  revalidatePath('/stats', 'page')
  return { success: true as const, data }
}
