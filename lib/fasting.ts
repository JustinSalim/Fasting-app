export function formatElapsed(totalSeconds: number): string {
  const totalMinutes = Math.floor(totalSeconds / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)
  return `${pad(hours)}:${pad(minutes)}`
}

export function getFastingStage(elapsedHours: number): 'fasting' | 'fat_burning' {
  return elapsedHours >= 12 ? 'fat_burning' : 'fasting'
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
