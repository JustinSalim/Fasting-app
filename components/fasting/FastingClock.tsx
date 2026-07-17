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
  phase?: 'fasting' | 'eating' | null
  onTargetReached?: () => void
}

const RING_RADIUS = 150
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

export function FastingClock({ isFasting, startTime, targetDuration, phase = null, onTargetReached }: FastingClockProps) {
  const [elapsedSeconds, setElapsedSeconds] = React.useState(0)
  const hasFiredTargetReached = React.useRef(false)

  React.useEffect(() => {
    hasFiredTargetReached.current = false
  }, [startTime])

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

  React.useEffect(() => {
    if (
      onTargetReached &&
      remainingSeconds !== null &&
      remainingSeconds <= 0 &&
      !hasFiredTargetReached.current
    ) {
      hasFiredTargetReached.current = true
      onTargetReached()
    }
  }, [remainingSeconds, onTargetReached])

  // With onTargetReached wired up, the caller stops the fast/window at target,
  // so overtime never renders in practice — this guards the display only.
  const isOvertime = remainingSeconds !== null && remainingSeconds < 0
  const clockText = remainingSeconds === null
    ? formatElapsed(displaySeconds)
    : isOvertime
      ? `+${formatElapsed(-remainingSeconds)}`
      : formatElapsed(remainingSeconds)

  const progress = isFasting && targetDuration ? getProgressFraction(targetDuration, displaySeconds) : 0
  const isEating = phase === 'eating'

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
          className={isEating ? 'stroke-tertiary' : isOvertime ? 'stroke-secondary' : 'stroke-primary'}
        />
      </svg>
      <div className="font-label-caps text-label-caps text-on-surface-variant mb-2 opacity-70">
        {isFasting ? (isEating ? 'EATING WINDOW' : 'CURRENT FAST') : 'READY TO FAST'}
      </div>
      <div
        className={`font-display-clock text-display-clock tracking-tighter leading-none mb-1 tabular-nums ${
          isEating ? 'text-tertiary' : isOvertime ? 'text-secondary' : 'text-primary'
        }`}
      >
        {clockText}
      </div>
      {isFasting && !isEating && (
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
