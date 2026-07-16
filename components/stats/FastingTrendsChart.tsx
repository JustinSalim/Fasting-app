'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { differenceInMinutes, parseISO } from 'date-fns'

export interface FastingLogSummary {
  id: string
  start_time: string
  end_time: string | null
  target_duration_hours: number
  status: 'completed' | 'missed' | 'partial'
}

interface FastingTrendsChartProps {
  logs: FastingLogSummary[]
  streak: number
  completionRate: number
}

const BAR_AREA_HEIGHT = 96

const barColor: Record<FastingLogSummary['status'], string> = {
  completed: 'bg-secondary',
  missed: 'bg-error',
  partial: 'bg-tertiary',
}

export function FastingTrendsChart({ logs, streak, completionRate }: FastingTrendsChartProps) {
  const recent = [...logs]
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    .slice(-14)

  return (
    <div className="w-full bg-surface-container-low rounded-3xl p-5 shadow-float">
      <div className="flex gap-6 mb-5">
        <div>
          <div className="font-body-md text-2xl font-semibold text-on-surface">{streak}</div>
          <div className="font-label-caps text-label-caps text-on-surface-variant">STREAK</div>
        </div>
        <div>
          <div className="font-body-md text-2xl font-semibold text-on-surface">{completionRate}%</div>
          <div className="font-label-caps text-label-caps text-on-surface-variant">30-DAY RATE</div>
        </div>
      </div>

      {recent.length === 0 ? (
        <p className="font-body-md text-body-md text-on-surface-variant">No fasts recorded yet.</p>
      ) : (
        <div className="flex items-end gap-1.5" style={{ height: BAR_AREA_HEIGHT }}>
          {recent.map((log) => {
            const end = log.end_time ? parseISO(log.end_time) : parseISO(log.start_time)
            const minutes = differenceInMinutes(end, parseISO(log.start_time))
            const targetMinutes = log.target_duration_hours * 60
            const percent = Math.min(100, Math.round((minutes / targetMinutes) * 100))
            const heightPx = Math.max((percent / 100) * BAR_AREA_HEIGHT, 4)
            return (
              <motion.div
                key={log.id}
                initial={{ height: 0 }}
                animate={{ height: heightPx }}
                transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
                className={`flex-1 rounded-full ${barColor[log.status]}`}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
