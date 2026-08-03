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

export async function startFastingLog(targetDurationHours: number, phase: 'fasting' | 'eating' = 'fasting') {
  const supabase = await getServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('min_fasting_threshold_minutes')
    .eq('id', user.id)
    .single()
  const thresholdMinutes = profile?.min_fasting_threshold_minutes ?? 5

  const { data: ongoing } = await supabase
    .from('fasting_logs')
    .select('id, start_time')
    .eq('user_id', user.id)
    .eq('status', 'ongoing')

  for (const log of ongoing ?? []) {
    const elapsedMinutes = (Date.now() - new Date(log.start_time).getTime()) / 60000
    if (elapsedMinutes < thresholdMinutes) {
      await supabase.from('fasting_logs').delete().eq('id', log.id)
    } else {
      await supabase.from('fasting_logs').update({ status: 'missed', end_time: new Date().toISOString() }).eq('id', log.id)
    }
  }

  const { data, error } = await supabase.from('fasting_logs').insert({
    user_id: user.id,
    start_time: new Date().toISOString(),
    target_duration_hours: targetDurationHours,
    phase,
    status: 'ongoing'
  }).select().single()

  if (error) return { error: error.message }
  revalidatePath('/dashboard', 'layout')
  return { success: true as const, data }
}

export async function updateFastingLog(id: string, _status?: 'completed' | 'missed') {
  const supabase = await getServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  // Derive completed/missed from real timestamps server-side. The client's
  // computeStopOutcome can be wrong if the device clock is skewed (a fast
  // device clock made a 7h fast look like it hit a 16h goal), so never trust
  // the client-passed status.
  const { data: log } = await supabase
    .from('fasting_logs')
    .select('start_time, target_duration_hours')
    .eq('id', id).eq('user_id', user.id).single()
  if (!log) return { error: 'Not found' }

  const now = new Date()
  const elapsedMinutes = (now.getTime() - new Date(log.start_time).getTime()) / 60000
  const status = elapsedMinutes >= log.target_duration_hours * 60 ? 'completed' : 'missed'

  const { error } = await supabase.from('fasting_logs').update({
    status,
    end_time: now.toISOString()
  }).eq('id', id).eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/dashboard', 'layout')
  return { success: true as const }
}

export async function completeFastingLogAtTarget(id: string, startTime: string, targetDurationHours: number) {
  const supabase = await getServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const targetEnd = new Date(startTime).getTime() + targetDurationHours * 3600_000
  // Client fires this when it believes the target is reached; a skewed device
  // clock can trigger it hours early. Only complete if the target has actually
  // elapsed per server time.
  if (Date.now() < targetEnd) return { error: 'Target not yet reached' }

  const { error } = await supabase.from('fasting_logs').update({
    status: 'completed',
    end_time: new Date(targetEnd).toISOString()
  }).eq('id', id).eq('user_id', user.id).eq('status', 'ongoing')

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
