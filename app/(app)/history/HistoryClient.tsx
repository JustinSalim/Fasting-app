'use client'

import * as React from 'react'
import { CheckCircle2, Flame, HelpCircle } from 'lucide-react'
import { motion } from 'framer-motion'
import { format, differenceInMinutes, parseISO } from 'date-fns'
import { Modal } from '@/components/ui/Modal'

interface FastingLog {
  id: string
  start_time: string
  end_time: string | null
  target_duration_hours: number
  status: 'completed' | 'missed' | 'partial'
}

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 300, damping: 24 } },
}

const statusStyle = {
  completed: { icon: CheckCircle2, container: 'bg-secondary-container text-on-secondary-container', bar: 'bg-secondary', label: 'Completed' },
  missed: { icon: Flame, container: 'bg-error-container text-on-error-container', bar: 'bg-error', label: 'Missed' },
  partial: { icon: HelpCircle, container: 'bg-tertiary-container text-on-tertiary-container', bar: 'bg-tertiary', label: 'Partial' },
} as const

function formatDuration(start: string, end: string | null) {
  if (!end) return 'Ongoing'
  const mins = differenceInMinutes(parseISO(end), parseISO(start))
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${h}h ${m}m`
}

export function HistoryClient({ logs }: { logs: FastingLog[] }) {
  const [selectedLog, setSelectedLog] = React.useState<FastingLog | null>(null)

  return (
    <div className="flex flex-col flex-1 px-container-margin py-4 pb-32">
      <header className="mb-6">
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-primary tracking-tighter">History</h1>
        <p className="font-body-md text-body-md text-on-surface-variant">Your past fasts, saved automatically.</p>
      </header>

      {logs.length === 0 ? (
        <div className="text-center py-12 font-body-md text-body-md text-on-surface-variant">
          No fasts recorded yet. Start your first fast from Home.
        </div>
      ) : (
        <motion.div variants={containerVariants} initial="hidden" animate="show" className="flex flex-col gap-4">
          {logs.map((log) => {
            const start = parseISO(log.start_time)
            const style = statusStyle[log.status] ?? statusStyle.missed
            const Icon = style.icon

            let progress = 0
            if (log.end_time) {
              const mins = differenceInMinutes(parseISO(log.end_time), start)
              const targetMins = (log.target_duration_hours || 16) * 60
              progress = Math.min(100, Math.round((mins / targetMins) * 100))
            }

            return (
              <motion.button
                key={log.id}
                variants={itemVariants}
                onClick={() => setSelectedLog(log)}
                className="text-left bg-surface-container-low p-5 rounded-3xl shadow-float hover:shadow-float-hover active:scale-[0.99] transition-all"
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <span className="font-label-caps text-label-caps text-on-surface-variant">
                      {format(start, 'EEE, d MMM')}
                    </span>
                    <h3 className="font-headline-lg-mobile text-lg font-semibold text-on-surface">
                      {log.target_duration_hours}h Fast
                    </h3>
                  </div>
                  <div className={`p-2 rounded-full ${style.container}`}>
                    <Icon size={20} strokeWidth={2.5} />
                  </div>
                </div>

                <div className="flex items-end gap-2">
                  <span className="font-body-md text-2xl font-semibold text-on-surface">{formatDuration(log.start_time, log.end_time)}</span>
                  <span className="font-body-md text-sm text-on-surface-variant mb-1">/ {log.target_duration_hours}h goal</span>
                </div>

                <div className="w-full h-2 bg-surface-container-highest rounded-full mt-4 overflow-hidden">
                  <div className={`h-full rounded-full ${style.bar}`} style={{ width: `${progress}%` }} />
                </div>
              </motion.button>
            )
          })}
        </motion.div>
      )}

      <Modal isOpen={!!selectedLog} onClose={() => setSelectedLog(null)} title="Fast details">
        {selectedLog && (() => {
          const start = parseISO(selectedLog.start_time)
          const end = selectedLog.end_time ? parseISO(selectedLog.end_time) : null
          const style = statusStyle[selectedLog.status] ?? statusStyle.missed
          const Icon = style.icon

          return (
            <div className="flex flex-col">
              <div className="flex items-center gap-3 mb-6">
                <div className={`p-3 rounded-full ${style.container}`}>
                  <Icon size={24} strokeWidth={2.5} />
                </div>
                <div>
                  <p className="font-body-md font-semibold text-on-surface">{style.label}</p>
                  <p className="font-body-md text-sm text-on-surface-variant">{format(start, 'MMMM d, yyyy')}</p>
                </div>
              </div>

              <div className="bg-surface-container rounded-2xl p-4">
                <div className="flex justify-between mb-2">
                  <span className="font-body-md text-sm text-on-surface-variant">Started</span>
                  <span className="font-body-md text-sm font-semibold text-on-surface">{format(start, 'h:mm a')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-body-md text-sm text-on-surface-variant">Ended</span>
                  <span className="font-body-md text-sm font-semibold text-on-surface">{end ? format(end, 'h:mm a') : 'Ongoing'}</span>
                </div>
              </div>
            </div>
          )
        })()}
      </Modal>
    </div>
  )
}
