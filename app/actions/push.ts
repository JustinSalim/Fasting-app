'use server'

import { createClient } from '@/utils/supabase/server'

interface PushSubscriptionInput {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export async function subscribeToPush(subscription: PushSubscriptionInput) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: user.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
    { onConflict: 'endpoint' }
  )

  if (error) return { error: error.message }
  return { success: true as const }
}

export async function unsubscribeFromPush(endpoint: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  return { success: true as const }
}
