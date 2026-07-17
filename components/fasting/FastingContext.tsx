'use client'

import React, { createContext, useContext, useState } from 'react'

type Phase = 'fasting' | 'eating'

type FastingContextType = {
  isFasting: boolean
  startTime: Date | null
  targetDuration: number | null
  activeFastId?: string | null
  phase: Phase | null
  startFast: (targetHours: number, id: string, start: Date, phase: Phase) => void
  stopFast: () => void
}

const FastingContext = createContext<FastingContextType | undefined>(undefined)

export function FastingProvider({ children, initialFast }: { children: React.ReactNode, initialFast?: { id: string, start_time: string, target_duration_hours: number, phase?: Phase } | null }) {
  const [activeFastId, setActiveFastId] = useState<string | null>(initialFast?.id || null)
  const [isFasting, setIsFasting] = useState(!!initialFast)
  const [startTime, setStartTime] = useState<Date | null>(initialFast ? new Date(initialFast.start_time) : null)
  const [targetDuration, setTargetDuration] = useState<number | null>(initialFast?.target_duration_hours || null)
  const [phase, setPhase] = useState<Phase | null>(initialFast?.phase ?? (initialFast ? 'fasting' : null))
  const [prevInitialFast, setPrevInitialFast] = useState(initialFast)

  // Re-sync local state from `initialFast` when the prop reference changes (e.g. server
  // revalidation), without clobbering optimistic updates from startFast/stopFast in between.
  // This is the React-docs "adjusting state when a prop changes" pattern: compute during
  // render instead of in a useEffect, so it doesn't trigger an extra commit/cascading render.
  if (initialFast !== prevInitialFast) {
    setPrevInitialFast(initialFast)
    setIsFasting(!!initialFast)
    setActiveFastId(initialFast?.id || null)
    setStartTime(initialFast ? new Date(initialFast.start_time) : null)
    setTargetDuration(initialFast?.target_duration_hours || null)
    setPhase(initialFast?.phase ?? (initialFast ? 'fasting' : null))
  }

  const startFast = (targetHours: number, id: string, start: Date, startPhase: Phase) => {
    setIsFasting(true)
    setStartTime(start)
    setTargetDuration(targetHours)
    setActiveFastId(id)
    setPhase(startPhase)
  }

  const stopFast = () => {
    setIsFasting(false)
    setStartTime(null)
    setTargetDuration(null)
    setActiveFastId(null)
    setPhase(null)
  }

  return (
    <FastingContext.Provider value={{ isFasting, startTime, targetDuration, activeFastId, phase, startFast, stopFast }}>
      {children}
    </FastingContext.Provider>
  )
}

export function useFasting() {
  const context = useContext(FastingContext)
  if (!context) throw new Error('useFasting must be used within FastingProvider')
  return context
}
