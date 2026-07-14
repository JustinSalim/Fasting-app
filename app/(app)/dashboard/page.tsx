import DashboardClient from './DashboardClient'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profileData } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const profile = profileData || {
    full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'there',
  }

  return <DashboardClient initialProfile={profile} />
}
