import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { HistoryClient } from './HistoryClient'

export default async function HistoryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: logs } = await supabase
    .from('fasting_logs')
    .select('id, start_time, end_time, target_duration_hours, status')
    .eq('user_id', user.id)
    .neq('status', 'ongoing')
    .order('start_time', { ascending: false })

  return <HistoryClient logs={logs || []} />
}
