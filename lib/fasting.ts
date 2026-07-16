import { differenceInCalendarDays } from 'date-fns'

export function formatElapsed(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor(totalSeconds / 60) % 60
  const seconds = Math.floor(totalSeconds) % 60
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
}

export function getFastingStage(elapsedHours: number): 'fasting' | 'fat_burning' {
  return elapsedHours >= 12 ? 'fat_burning' : 'fasting'
}

export function getRemainingSeconds(targetHours: number, elapsedSeconds: number): number {
  return targetHours * 3600 - elapsedSeconds
}

export function getProgressFraction(targetHours: number, elapsedSeconds: number): number {
  const targetSeconds = targetHours * 3600
  if (targetSeconds <= 0) return 0
  return Math.min(1, elapsedSeconds / targetSeconds)
}

export function computeStopOutcome(
  startTime: Date,
  targetHours: number,
  now: Date,
  thresholdMinutes = 5
): { action: 'discard' } | { action: 'save'; status: 'completed' | 'missed' } {
  const elapsedMinutes = (now.getTime() - startTime.getTime()) / 60000

  if (elapsedMinutes < thresholdMinutes) {
    return { action: 'discard' }
  }

  const status = elapsedMinutes >= targetHours * 60 ? 'completed' : 'missed'
  return { action: 'save', status }
}

export interface StreakLog {
  start_time: string
  status: 'completed' | 'missed' | 'partial'
}

export function getCurrentStreak(logs: StreakLog[], now: Date): number {
  const sorted = [...logs].sort(
    (a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime()
  )

  if (sorted.length === 0) return 0

  if (differenceInCalendarDays(now, new Date(sorted[0].start_time)) > 1) {
    return 0
  }

  let streak = 0
  for (const log of sorted) {
    if (log.status !== 'completed') break
    streak++
  }
  return streak
}

export function getCompletionRate(logs: StreakLog[], now: Date, windowDays = 30): number {
  const cutoff = now.getTime() - windowDays * 24 * 60 * 60 * 1000
  const inWindow = logs.filter((log) => new Date(log.start_time).getTime() >= cutoff)

  if (inWindow.length === 0) return 0

  const completed = inWindow.filter((log) => log.status === 'completed').length
  return Math.round((completed / inWindow.length) * 100)
}
