'use server'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'

async function getServerSupabase() {
  const cookieStore = await cookies()
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() { return cookieStore.getAll() },
      setAll(cookiesToSet) { try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {} }
    }
  })
}

export async function startFastingLog(targetDurationHours: number) {
  const supabase = await getServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  await supabase.from('fasting_logs').update({ status: 'missed', end_time: new Date().toISOString() }).eq('user_id', user.id).eq('status', 'ongoing')

  const { data, error } = await supabase.from('fasting_logs').insert({
    user_id: user.id,
    start_time: new Date().toISOString(),
    target_duration_hours: targetDurationHours,
    status: 'ongoing'
  }).select().single()

  if (error) return { error: error.message }
  revalidatePath('/dashboard', 'layout')
  return { success: true as const, data }
}

export async function updateFastingLog(id: string, status: 'completed' | 'missed') {
  const supabase = await getServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { error } = await supabase.from('fasting_logs').update({
    status,
    end_time: new Date().toISOString()
  }).eq('id', id).eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/dashboard', 'layout')
  return { success: true as const }
}

export async function cancelFastingLog(id: string) {
  const supabase = await getServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { error } = await supabase.from('fasting_logs').delete().eq('id', id).eq('user_id', user.id)
  if (error) return { error: error.message }
  revalidatePath('/dashboard', 'layout')
  return { success: true as const }
}
