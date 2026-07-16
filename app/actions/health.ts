'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function logWeight(value: number) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const { data: existing } = await supabase
    .from('health_logs')
    .select('id')
    .eq('user_id', user.id)
    .eq('log_type', 'weight')
    .gte('created_at', todayStart.toISOString())
    .maybeSingle()

  const { data, error } = existing
    ? await supabase
        .from('health_logs')
        .update({ value: String(value) })
        .eq('id', existing.id)
        .select('id, value, created_at')
        .single()
    : await supabase
        .from('health_logs')
        .insert({ user_id: user.id, log_type: 'weight', value: String(value) })
        .select('id, value, created_at')
        .single()

  if (error) return { error: error.message }
  revalidatePath('/stats', 'page')
  return { success: true as const, data }
}
