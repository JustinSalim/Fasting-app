export interface FastProgress {
  elapsedMinutes: number
  targetDurationHours: number
  targetNotifiedAt: string | null
  reminderNotifiedAt: string | null
}

export interface OngoingLog {
  id: string
  startTime: string
  targetDurationHours: number
}

export function shouldSendGoalReached(fast: FastProgress): boolean {
  if (fast.targetNotifiedAt !== null) return false
  return fast.elapsedMinutes >= fast.targetDurationHours * 60
}

export function shouldSendPreGoalReminder(fast: FastProgress, reminderOffsetMinutes: number): boolean {
  if (fast.targetNotifiedAt !== null || fast.reminderNotifiedAt !== null) return false
  const targetMinutes = fast.targetDurationHours * 60
  // Once elapsed reaches the target itself, goal-reached owns the notification —
  // without this upper bound a skipped cron tick could fire both in one pass.
  return fast.elapsedMinutes >= targetMinutes - reminderOffsetMinutes && fast.elapsedMinutes < targetMinutes
}

export function isSameLocalDate(isoTimestamp: string, timezone: string, nowUtc: Date): boolean {
  const format = (d: Date) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
  return format(new Date(isoTimestamp)) === format(nowUtc)
}

function toMinutesSinceMidnight(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export function isWithinReminderWindow(nowLocalHHMM: string, dailyReminderTime: string, windowMinutes: number): boolean {
  const now = toMinutesSinceMidnight(nowLocalHHMM)
  const target = toMinutesSinceMidnight(dailyReminderTime)
  const diff = (now - target + 1440) % 1440
  return diff < windowMinutes
}

export function getOverdueOngoingLogs(logs: OngoingLog[], now: Date): OngoingLog[] {
  return logs.filter((log) => {
    const targetMs = new Date(log.startTime).getTime() + log.targetDurationHours * 3600_000
    return now.getTime() >= targetMs
  })
}
