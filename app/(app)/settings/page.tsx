import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { SettingsClient } from './SettingsClient'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, avatar_url, birth_date, reminder_offset_minutes, min_fasting_threshold_minutes, weight_unit')
    .eq('id', user.id)
    .single()

  return <SettingsClient initialProfile={profile} />
}
