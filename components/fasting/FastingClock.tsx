'use client'

import * as React from 'react'
import { differenceInSeconds } from 'date-fns'
import { motion } from 'framer-motion'
import { Flame } from 'lucide-react'
import { formatElapsed, getFastingStage, getRemainingSeconds, getProgressFraction } from '@/lib/fasting'

interface FastingClockProps {
  isFasting: boolean
  startTime: Date | null
  targetDuration: number | null
}

const RING_RADIUS = 150
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

export function FastingClock({ isFasting, startTime, targetDuration }: FastingClockProps) {
  const [elapsedSeconds, setElapsedSeconds] = React.useState(0)

  React.useEffect(() => {
    if (!isFasting || !startTime) return
    const tick = () => setElapsedSeconds(differenceInSeconds(new Date(), startTime))
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [isFasting, startTime])

  const displaySeconds = isFasting && startTime ? elapsedSeconds : 0
  const stage = getFastingStage(displaySeconds / 3600)

  const remainingSeconds = isFasting && targetDuration
    ? getRemainingSeconds(targetDuration, displaySeconds)
    : null
  const isOvertime = remainingSeconds !== null && remainingSeconds < 0
  const clockText = remainingSeconds === null
    ? formatElapsed(displaySeconds)
    : isOvertime
      ? `+${formatElapsed(-remainingSeconds)}`
      : formatElapsed(remainingSeconds)

  const progress = isFasting && targetDuration ? getProgressFraction(targetDuration, displaySeconds) : 0

  return (
    <div className="relative w-full aspect-square max-w-[320px] rounded-full flex flex-col items-center justify-center shadow-float bg-surface/50 backdrop-blur-md animate-float">
      <div className="absolute inset-0 rounded-full border border-surface-tint/5 pointer-events-none" />
      <svg viewBox="0 0 320 320" className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none">
        <circle
          cx="160"
          cy="160"
          r={RING_RADIUS}
          fill="none"
          strokeWidth={6}
          className="stroke-surface-container-highest"
        />
        <motion.circle
          cx="160"
          cy="160"
          r={RING_RADIUS}
          fill="none"
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          animate={{ strokeDashoffset: RING_CIRCUMFERENCE * (1 - progress) }}
          transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
          className={isOvertime ? 'stroke-secondary' : 'stroke-primary'}
        />
      </svg>
      <div className="font-label-caps text-label-caps text-on-surface-variant mb-2 opacity-70">
        {isFasting ? 'CURRENT FAST' : 'READY TO FAST'}
      </div>
      <div
        className={`font-display-clock text-display-clock tracking-tighter leading-none mb-1 tabular-nums ${
          isOvertime ? 'text-secondary' : 'text-primary'
        }`}
      >
        {clockText}
      </div>
      {isFasting && (
        <div className="flex items-center gap-2 mt-4 bg-secondary-container/30 px-4 py-1.5 rounded-full">
          <Flame size={16} className="text-secondary" />
          <span className="font-label-caps text-label-caps text-secondary">
            {stage === 'fat_burning' ? 'FAT BURNING' : 'FASTING'}
          </span>
        </div>
      )}
    </div>
  )
}
