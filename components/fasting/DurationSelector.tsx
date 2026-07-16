'use client'

import * as React from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatTargetDuration } from '@/lib/fasting'
import { Modal } from '@/components/ui/Modal'

const PRESETS = [2, 4, 6, 8]
const MINUTE_OPTIONS = [0, 15, 30, 45]

interface DurationSelectorProps {
  duration: number | null
  setDuration: (duration: number) => void
  disabled?: boolean
}

export function DurationSelector({ duration, setDuration, disabled }: DurationSelectorProps) {
  const isCustom = duration !== null && !PRESETS.includes(duration)
  const [showCustom, setShowCustom] = React.useState(false)
  const [customHours, setCustomHours] = React.useState(16)
  const [customMinutes, setCustomMinutes] = React.useState(0)

  const openCustom = () => {
    const base = duration ?? 16
    setCustomHours(Math.floor(base))
    setCustomMinutes(Math.round((base % 1) * 60))
    setShowCustom(true)
  }

  const confirmCustom = () => {
    const total = customHours + customMinutes / 60
    if (total >= 1 && total <= 72) setDuration(total)
    setShowCustom(false)
  }

  return (
    <>
      <div className="flex items-center justify-start sm:justify-center gap-stack-gap w-full overflow-x-auto pb-4">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            disabled={disabled}
            onClick={() => setDuration(preset)}
            className={cn(
              'shrink-0 w-16 h-16 rounded-2xl flex items-center justify-center shadow-float transition-colors duration-300 ease-glide font-body-md text-body-md font-medium disabled:opacity-50',
              duration === preset
                ? 'bg-primary-container/20 text-primary border border-primary-container/30'
                : 'bg-surface text-on-surface-variant hover:bg-surface-container-low'
            )}
          >
            {preset}H
          </button>
        ))}
        <button
          disabled={disabled}
          onClick={openCustom}
          className={cn(
            'shrink-0 px-4 h-16 rounded-2xl flex items-center justify-center gap-2 shadow-float transition-colors duration-300 ease-glide font-body-md text-body-md font-medium disabled:opacity-50',
            isCustom
              ? 'bg-primary-container/20 text-primary border border-primary-container/30'
              : 'bg-surface text-on-surface-variant hover:bg-surface-container-low'
          )}
        >
          <SlidersHorizontal size={18} />
          {isCustom && duration ? formatTargetDuration(duration) : 'Custom'}
        </button>
      </div>

      <Modal isOpen={showCustom} onClose={() => setShowCustom(false)} title="Custom duration">
        <div className="flex gap-3 mb-6">
          <label className="flex-1 flex flex-col gap-1">
            <span className="font-body-md text-sm text-on-surface-variant">Hours</span>
            <input
              type="number"
              min={1}
              max={72}
              value={customHours}
              onChange={(e) => setCustomHours(Number(e.target.value))}
              className="bg-surface-container rounded-2xl px-4 py-3 font-body-md text-body-md text-on-surface"
            />
          </label>
          <label className="flex-1 flex flex-col gap-1">
            <span className="font-body-md text-sm text-on-surface-variant">Minutes</span>
            <select
              value={customMinutes}
              onChange={(e) => setCustomMinutes(Number(e.target.value))}
              className="bg-surface-container rounded-2xl px-4 py-3 font-body-md text-body-md text-on-surface"
            >
              {MINUTE_OPTIONS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="button"
          onClick={confirmCustom}
          className="w-full py-3 rounded-full font-label-caps text-label-caps bg-primary-container text-on-primary-container"
        >
          SET DURATION
        </button>
      </Modal>
    </>
  )
}
