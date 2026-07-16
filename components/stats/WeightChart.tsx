'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { format, parseISO } from 'date-fns'

export interface WeightEntry {
  id: string
  value: number
  created_at: string
}

interface WeightChartProps {
  entries: WeightEntry[]
  unit: 'kg' | 'lb'
}

const WIDTH = 300
const HEIGHT = 140
const PADDING = 24

export function WeightChart({ entries, unit }: WeightChartProps) {
  const values = entries.map((e) => e.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1

  const points = entries.map((entry, index) => {
    const x = entries.length === 1
      ? WIDTH / 2
      : PADDING + (index / (entries.length - 1)) * (WIDTH - PADDING * 2)
    const y = HEIGHT - PADDING - ((entry.value - min) / range) * (HEIGHT - PADDING * 2)
    return { x, y, entry }
  })

  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ')

  const first = entries[0]
  const last = entries[entries.length - 1]

  return (
    <div className="w-full bg-surface-container-low rounded-3xl p-5 shadow-float">
      <div className="flex justify-between items-baseline mb-4">
        <span className="font-label-caps text-label-caps text-on-surface-variant">WEIGHT</span>
        <span className="font-body-md text-2xl font-semibold text-on-surface">
          {last.value.toFixed(1)} <span className="text-sm text-on-surface-variant">{unit}</span>
        </span>
      </div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-auto overflow-visible">
        <motion.path
          d={path}
          fill="none"
          className="stroke-primary"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }}
        />
        {points.map((p) => (
          <circle key={p.entry.id} cx={p.x} cy={p.y} r={3} className="fill-primary" />
        ))}
      </svg>
      <div className="flex justify-between mt-2 font-body-md text-xs text-on-surface-variant">
        <span>{format(parseISO(first.created_at), 'd MMM')}</span>
        <span>{format(parseISO(last.created_at), 'd MMM')}</span>
      </div>
    </div>
  )
}
