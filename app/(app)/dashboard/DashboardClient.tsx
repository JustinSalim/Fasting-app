'use client'

import * as React from 'react'
import { Bell, Play, Square } from 'lucide-react'
import { useFasting } from '@/components/fasting/FastingContext'
import { DurationSelector } from '@/components/fasting/DurationSelector'
import { FastingClock } from '@/components/fasting/FastingClock'
import { Modal } from '@/components/ui/Modal'
import { startFastingLog, updateFastingLog, cancelFastingLog } from '@/app/actions/fasting'
import { computeStopOutcome } from '@/lib/fasting'

interface DashboardClientProps {
  initialProfile: { full_name: string | null; min_fasting_threshold_minutes?: number | null }
}

export default function DashboardClient({ initialProfile }: DashboardClientProps) {
  const { isFasting, startTime, targetDuration, activeFastId, startFast, stopFast } = useFasting()
  const [duration, setDuration] = React.useState<number | null>(targetDuration)
  const [showConfirm, setShowConfirm] = React.useState(false)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [confirmError, setConfirmError] = React.useState<string | null>(null)

  const firstName = initialProfile.full_name?.split(' ')[0] || 'there'
  const thresholdMinutes = initialProfile.min_fasting_threshold_minutes ?? 5

  const openConfirm = () => {
    setConfirmError(null)
    setShowConfirm(true)
  }

  const closeConfirm = () => {
    setConfirmError(null)
    setShowConfirm(false)
  }

  const handleConfirm = async () => {
    setIsSubmitting(true)
    setConfirmError(null)
    if (isFasting && startTime && targetDuration && activeFastId) {
      const outcome = computeStopOutcome(startTime, targetDuration, new Date(), thresholdMinutes)
      const result = outcome.action === 'discard'
        ? await cancelFastingLog(activeFastId)
        : await updateFastingLog(activeFastId, outcome.status)
      if (!result.success) {
        setConfirmError(result.error)
        setIsSubmitting(false)
        return
      }
      stopFast()
    } else if (duration) {
      const result = await startFastingLog(duration)
      if (!result.success) {
        setConfirmError(result.error)
        setIsSubmitting(false)
        return
      }
      startFast(duration, result.data.id, new Date(result.data.start_time))
    }
    setIsSubmitting(false)
    setShowConfirm(false)
  }

  return (
    <div className="flex flex-col flex-1">
      <header className="flex justify-between items-center px-container-margin py-4">
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-primary tracking-tighter">
          Hi, {firstName}
        </h1>
        <div className="w-10 h-10 rounded-full flex items-center justify-center text-on-surface-variant bg-surface-container-low shadow-float">
          <Bell size={18} />
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-container-margin py-section-padding gap-section-padding">
        <FastingClock isFasting={isFasting} startTime={startTime} targetDuration={targetDuration} />

        {!isFasting && (
          <DurationSelector duration={duration} setDuration={setDuration} />
        )}

        <button
          onClick={openConfirm}
          disabled={!isFasting && !duration}
          className="w-24 h-24 rounded-full bg-primary-container text-on-primary-container flex flex-col items-center justify-center shadow-float animate-pulse-glow hover:scale-105 active:scale-95 transition-transform duration-300 ease-glide disabled:opacity-50 disabled:animate-none"
        >
          {isFasting ? <Square size={20} /> : <Play size={20} />}
          <span className="font-label-caps text-label-caps mt-1">{isFasting ? 'STOP' : 'START'}</span>
        </button>
      </main>

      <Modal isOpen={showConfirm} onClose={closeConfirm} title={isFasting ? 'Stop Fasting' : 'Start Fasting'}>
        <p className="font-body-md text-body-md text-on-surface mb-6">
          Are you sure you want to {isFasting ? 'stop your current fast' : `start a ${duration}h fast`}?
        </p>
        {confirmError && (
          <p className="font-body-md text-body-md text-error text-sm px-1 mb-4">{confirmError}</p>
        )}
        <div className="flex gap-3">
          <button
            onClick={closeConfirm}
            disabled={isSubmitting}
            className="flex-1 py-3 rounded-full font-label-caps text-label-caps bg-surface-container-low text-on-surface hover:bg-surface-container transition-colors"
          >
            CANCEL
          </button>
          <button
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="flex-1 py-3 rounded-full font-label-caps text-label-caps bg-primary-container text-on-primary-container hover:shadow-float-hover transition-shadow disabled:opacity-50"
          >
            {isSubmitting ? 'SAVING...' : isFasting ? 'YES, STOP' : 'YES, START'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
