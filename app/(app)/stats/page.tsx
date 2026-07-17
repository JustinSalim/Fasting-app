import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { StatsClient } from './StatsClient'

export default async function StatsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: fastingLogs } = await supabase
    .from('fasting_logs')
    .select('id, start_time, end_time, target_duration_hours, status, phase')
    .eq('user_id', user.id)
    .neq('status', 'ongoing')
    .order('start_time', { ascending: false })

  const { data: weightLogs } = await supabase
    .from('health_logs')
    .select('id, value, created_at')
    .eq('user_id', user.id)
    .eq('log_type', 'weight')
    .order('created_at', { ascending: true })

  const { data: profile } = await supabase
    .from('profiles')
    .select('weight_unit')
    .eq('id', user.id)
    .single()

  return (
    <StatsClient
      fastingLogs={fastingLogs || []}
      weightLogs={weightLogs || []}
      weightUnit={(profile?.weight_unit as 'kg' | 'lb') || 'kg'}
    />
  )
}
