import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { sendPush, type PushSubscriptionRecord } from '@/lib/push'
import {
  shouldSendGoalReached,
  shouldSendPreGoalReminder,
  isSameLocalDate,
  isWithinReminderWindow,
} from '@/lib/notifications'

const WINDOW_MINUTES = 15
const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const now = new Date()

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, timezone, daily_reminder_time, reminder_offset_minutes')
    .eq('notifications_enabled', true)

  for (const profile of profiles ?? []) {
    const { data: subscriptions } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', profile.id)

    if (!subscriptions || subscriptions.length === 0) continue

    const send = async (title: string, body: string, url: string) => {
      for (const sub of subscriptions as (PushSubscriptionRecord & { id: string })[]) {
        const result = await sendPush(sub, { title, body, url })
        if (!result.delivered && result.expired) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id)
        }
      }
    }

    const { data: ongoingFasts } = await supabase
      .from('fasting_logs')
      .select('id, start_time, target_duration_hours, target_notified_at, reminder_notified_at')
      .eq('user_id', profile.id)
      .eq('status', 'ongoing')

    for (const f of ongoingFasts ?? []) {
      const elapsedMinutes = (now.getTime() - new Date(f.start_time).getTime()) / 60000
      const progress = {
        elapsedMinutes,
        targetDurationHours: f.target_duration_hours,
        targetNotifiedAt: f.target_notified_at,
        reminderNotifiedAt: f.reminder_notified_at,
      }

      if (shouldSendGoalReached(progress)) {
        await send('Fast complete', "You've reached your fasting goal.", '/dashboard')
        await supabase.from('fasting_logs').update({ target_notified_at: now.toISOString() }).eq('id', f.id)
      } else if (shouldSendPreGoalReminder(progress, profile.reminder_offset_minutes ?? 15)) {
        await send('Almost there', "You're almost at your fasting goal.", '/dashboard')
        await supabase.from('fasting_logs').update({ reminder_notified_at: now.toISOString() }).eq('id', f.id)
      }
    }

    if (!profile.timezone || !profile.daily_reminder_time) continue

    const nowLocalHHMM = new Intl.DateTimeFormat('en-GB', {
      timeZone: profile.timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(now)

    if (!isWithinReminderWindow(nowLocalHHMM, profile.daily_reminder_time, WINDOW_MINUTES)) continue

    const { data: recentFasts } = await supabase
      .from('fasting_logs')
      .select('start_time')
      .eq('user_id', profile.id)
      .gte('start_time', new Date(now.getTime() - TWO_DAYS_MS).toISOString())
      .order('start_time', { ascending: false })
      .limit(1)

    const startedToday = !!recentFasts?.[0] && isSameLocalDate(recentFasts[0].start_time, profile.timezone, now)
    if (!startedToday && (!ongoingFasts || ongoingFasts.length === 0)) {
      await send("Don't lose your streak", "You haven't started a fast today.", '/dashboard')
    }

    const { data: recentWeights } = await supabase
      .from('health_logs')
      .select('created_at')
      .eq('user_id', profile.id)
      .eq('log_type', 'weight')
      .gte('created_at', new Date(now.getTime() - TWO_DAYS_MS).toISOString())
      .order('created_at', { ascending: false })
      .limit(1)

    const loggedWeightToday = !!recentWeights?.[0] && isSameLocalDate(recentWeights[0].created_at, profile.timezone, now)
    if (!loggedWeightToday) {
      await send("Log today's weight", 'Keep your weight trend up to date.', '/stats')
    }
  }

  return NextResponse.json({ success: true })
}
