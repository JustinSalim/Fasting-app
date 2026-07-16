'use client'

import * as React from 'react'
import { Plus } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { WeightChart, type WeightEntry } from '@/components/stats/WeightChart'
import { FastingTrendsChart, type FastingLogSummary } from '@/components/stats/FastingTrendsChart'
import { getCurrentStreak, getCompletionRate } from '@/lib/fasting'
import { kgToLb, lbToKg } from '@/lib/units'
import { logWeight } from '@/app/actions/health'

interface RawWeightLog {
  id: string
  value: string
  created_at: string
}

interface StatsClientProps {
  fastingLogs: FastingLogSummary[]
  weightLogs: RawWeightLog[]
  weightUnit: 'kg' | 'lb'
}

export function StatsClient({ fastingLogs, weightLogs, weightUnit }: StatsClientProps) {
  const [showAddWeight, setShowAddWeight] = React.useState(false)
  const [weightInput, setWeightInput] = React.useState('')
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const weightEntries: WeightEntry[] = weightLogs
    .map((log) => {
      const raw = Number(log.value)
      const value = weightUnit === 'lb' ? kgToLb(raw) : raw
      return { id: log.id, value, created_at: log.created_at }
    })
    .filter((entry) => !Number.isNaN(entry.value))

  const streak = getCurrentStreak(fastingLogs, new Date())
  const completionRate = getCompletionRate(fastingLogs, new Date())

  const openAddWeight = () => {
    setError(null)
    setWeightInput('')
    setShowAddWeight(true)
  }

  const handleAddWeight = async () => {
    const parsed = Number(weightInput)
    if (Number.isNaN(parsed) || parsed <= 0) {
      setError('Enter a valid weight')
      return
    }
    setIsSubmitting(true)
    setError(null)
    const kgValue = weightUnit === 'lb' ? lbToKg(parsed) : parsed
    const result = await logWeight(kgValue)
    setIsSubmitting(false)
    if (!result.success) {
      setError(result.error)
      return
    }
    setShowAddWeight(false)
  }

  return (
    <div className="flex flex-col flex-1 px-container-margin py-4 pb-32 gap-4">
      <header className="mb-2">
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-primary tracking-tighter">Stats</h1>
        <p className="font-body-md text-body-md text-on-surface-variant">Your progress over time.</p>
      </header>

      {weightEntries.length > 0 ? (
        <>
          <WeightChart entries={weightEntries} unit={weightUnit} />
          <button
            onClick={openAddWeight}
            className="self-end font-label-caps text-label-caps bg-surface-container-low text-on-surface px-4 py-2 rounded-full inline-flex items-center gap-2 shadow-float"
          >
            <Plus size={14} /> ADD WEIGHT
          </button>
        </>
      ) : (
        <div className="bg-surface-container-low rounded-3xl p-6 shadow-float text-center">
          <p className="font-body-md text-body-md text-on-surface-variant mb-4">No weight logged yet.</p>
          <button
            onClick={openAddWeight}
            className="font-label-caps text-label-caps bg-primary-container text-on-primary-container px-5 py-2.5 rounded-full inline-flex items-center gap-2"
          >
            <Plus size={16} /> ADD WEIGHT
          </button>
        </div>
      )}

      <FastingTrendsChart logs={fastingLogs} streak={streak} completionRate={completionRate} />

      <Modal isOpen={showAddWeight} onClose={() => setShowAddWeight(false)} title="Add weight">
        <input
          type="number"
          inputMode="decimal"
          value={weightInput}
          onChange={(e) => setWeightInput(e.target.value)}
          placeholder={`Weight in ${weightUnit}`}
          className="w-full bg-surface-container rounded-2xl px-4 py-3 font-body-md text-body-md text-on-surface mb-4"
        />
        {error && <p className="font-body-md text-sm text-error mb-4">{error}</p>}
        <button
          onClick={handleAddWeight}
          disabled={isSubmitting}
          className="w-full py-3 rounded-full font-label-caps text-label-caps bg-primary-container text-on-primary-container disabled:opacity-50"
        >
          {isSubmitting ? 'SAVING...' : 'SAVE'}
        </button>
      </Modal>
    </div>
  )
}
