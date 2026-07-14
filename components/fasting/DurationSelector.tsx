'use client'

import * as React from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'

const PRESETS = [2, 4, 6, 8]

interface DurationSelectorProps {
  duration: number | null
  setDuration: (duration: number) => void
  disabled?: boolean
}

export function DurationSelector({ duration, setDuration, disabled }: DurationSelectorProps) {
  const [isCustom, setIsCustom] = React.useState(duration !== null && !PRESETS.includes(duration))

  return (
    <div className="flex items-center justify-center gap-stack-gap w-full overflow-x-auto pb-4">
      {PRESETS.map((preset) => (
        <button
          key={preset}
          disabled={disabled}
          onClick={() => {
            setDuration(preset)
            setIsCustom(false)
          }}
          className={cn(
            'shrink-0 w-16 h-16 rounded-2xl flex items-center justify-center shadow-float transition-colors duration-300 ease-glide font-body-md text-body-md font-medium disabled:opacity-50',
            duration === preset && !isCustom
              ? 'bg-primary-container/20 text-primary border border-primary-container/30'
              : 'bg-surface text-on-surface-variant hover:bg-surface-container-low'
          )}
        >
          {preset}H
        </button>
      ))}
      <button
        disabled={disabled}
        onClick={() => {
          setIsCustom(true)
          const hours = window.prompt('Custom fast duration, in hours (1–72):', duration ? String(duration) : '16')
          const parsed = hours ? Number(hours) : NaN
          if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= 72) {
            setDuration(parsed)
          }
        }}
        className={cn(
          'shrink-0 px-4 h-16 rounded-2xl flex items-center justify-center gap-2 shadow-float transition-colors duration-300 ease-glide font-body-md text-body-md font-medium disabled:opacity-50',
          isCustom
            ? 'bg-primary-container/20 text-primary border border-primary-container/30'
            : 'bg-surface text-on-surface-variant hover:bg-surface-container-low'
        )}
      >
        <SlidersHorizontal size={18} />
        {isCustom && duration ? `${duration}H` : 'Custom'}
      </button>
    </div>
  )
}
