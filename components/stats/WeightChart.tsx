'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { format, parseISO } from 'date-fns'
import { getWeightDelta } from '@/lib/weight'

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
  const [selectedIndex, setSelectedIndex] = React.useState<number | null>(null)

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
  const selected = selectedIndex !== null ? points[selectedIndex] : null
  const delta = selectedIndex !== null ? getWeightDelta(entries, selectedIndex) : null

  return (
    <div className="w-full bg-surface-container-low rounded-3xl p-5 shadow-float border border-outline-variant/50 dark:border-outline-variant/10">
      <div className="flex justify-between items-baseline mb-4">
        <span className="font-label-caps text-label-caps text-on-surface-variant">WEIGHT</span>
        <span className="font-body-md text-2xl font-semibold text-on-surface">
          {last.value.toFixed(1)} <span className="text-sm text-on-surface-variant">{unit}</span>
        </span>
      </div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full h-auto overflow-visible"
          onClick={() => setSelectedIndex(null)}
        >
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
          {points.map((p, i) => (
            <g key={p.entry.id}>
              <circle cx={p.x} cy={p.y} r={3} className="fill-primary" />
              <circle
                cx={p.x}
                cy={p.y}
                r={10}
                fill="transparent"
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation()
                  setSelectedIndex((current) => (current === i ? null : i))
                }}
              />
            </g>
          ))}
        </svg>
        {selected && (
          <div
            className={`absolute -translate-y-full mb-2 pointer-events-none bg-surface-container-high text-on-surface rounded-xl px-3 py-2 shadow-float text-xs whitespace-nowrap ${
              selectedIndex === 0
                ? 'translate-x-0'
                : selectedIndex === entries.length - 1
                ? '-translate-x-full'
                : '-translate-x-1/2'
            }`}
            style={{
              left: `${(selected.x / WIDTH) * 100}%`,
              top: `${(selected.y / HEIGHT) * 100}%`,
            }}
          >
            <div className="font-semibold">{format(parseISO(selected.entry.created_at), 'd MMM')}</div>
            <div>
              {selected.entry.value.toFixed(1)} {unit}
              {delta !== null && ` (${delta >= 0 ? '+' : ''}${delta.toFixed(1)})`}
            </div>
          </div>
        )}
      </div>
      <div className="flex justify-between mt-2 font-body-md text-xs text-on-surface-variant">
        <span>{format(parseISO(first.created_at), 'd MMM')}</span>
        <span>{format(parseISO(last.created_at), 'd MMM')}</span>
      </div>
    </div>
  )
}
