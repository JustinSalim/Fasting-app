'use client'

import * as React from 'react'
import { differenceInSeconds } from 'date-fns'
import { Flame } from 'lucide-react'
import { formatElapsed, getFastingStage } from '@/lib/fasting'

interface ElapsedClockProps {
  isFasting: boolean
  startTime: Date | null
}

export function ElapsedClock({ isFasting, startTime }: ElapsedClockProps) {
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

  return (
    <div className="relative w-full aspect-square max-w-[320px] rounded-full flex flex-col items-center justify-center shadow-float bg-surface/50 backdrop-blur-md animate-float">
      <div className="absolute inset-0 rounded-full border border-surface-tint/5 pointer-events-none" />
      <div className="font-label-caps text-label-caps text-on-surface-variant mb-2 opacity-70">
        {isFasting ? 'CURRENT FAST' : 'READY TO FAST'}
      </div>
      <div className="font-display-clock text-display-clock text-primary tracking-tighter leading-none mb-1">
        {formatElapsed(displaySeconds)}
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
