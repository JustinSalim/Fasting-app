'use client'

import * as React from 'react'
import { CheckCircle2, Flame, HelpCircle, Clock } from 'lucide-react'
import { motion } from 'framer-motion'
import { format, differenceInMinutes, parseISO } from 'date-fns'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatTargetDuration } from '@/lib/fasting'

interface FastingLog {
  id: string
  start_time: string
  end_time: string | null
  target_duration_hours: number
  status: 'completed' | 'missed' | 'partial'
  phase?: 'fasting' | 'eating'
}

interface CycleCard {
  id: string
  fasting: FastingLog | null
  eating: FastingLog | null
}

// Logs are one row per phase; pair a fasting row with the eating row it
// directly transitions into (fasting.end_time === eating.start_time) so
// history shows one card per day instead of two.
function groupIntoCycles(logs: FastingLog[]): CycleCard[] {
  const cards: CycleCard[] = []
  let i = 0
  while (i < logs.length) {
    const current = logs[i]
    const next = logs[i + 1]
    if (next && next.end_time && current.start_time === next.end_time && current.phase !== next.phase) {
      const fasting = current.phase === 'eating' ? next : current
      const eating = current.phase === 'eating' ? current : next
      cards.push({ id: current.id, fasting, eating })
      i += 2
    } else {
      cards.push({
        id: current.id,
        fasting: current.phase === 'eating' ? null : current,
        eating: current.phase === 'eating' ? current : null,
      })
      i += 1
    }
  }
  return cards
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
  const [selectedCard, setSelectedCard] = React.useState<CycleCard | null>(null)
  const cards = React.useMemo(() => groupIntoCycles(logs), [logs])

  return (
    <div className="flex flex-col flex-1 px-container-margin py-4 pb-32">
      <header className="mb-6">
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-primary tracking-tighter">History</h1>
        <p className="font-body-md text-body-md text-on-surface-variant">
          Your fasting and eating history, saved automatically.
        </p>
      </header>

      {cards.length === 0 ? (
        <EmptyState icon={Clock} title="No history recorded yet" subtitle="Start your first fast from Home." />
      ) : (
        <motion.div variants={containerVariants} initial="hidden" animate="show" className="flex flex-col gap-4">
          {cards.map((card) => {
            const primary = card.fasting ?? card.eating!
            const start = parseISO(primary.start_time)
            const style = statusStyle[primary.status] ?? statusStyle.missed
            const Icon = style.icon

            return (
              <motion.button
                key={card.id}
                variants={itemVariants}
                onClick={() => setSelectedCard(card)}
                className="text-left bg-surface-container-low p-5 rounded-3xl shadow-float border border-outline-variant/50 dark:border-outline-variant/10 hover:shadow-float-hover active:scale-[0.99] transition-all"
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <span className="font-label-caps text-label-caps text-on-surface-variant">
                      {format(start, 'EEE, d MMM')}
                    </span>
                    <h3 className="font-headline-lg-mobile text-lg font-semibold text-on-surface">Daily Cycle</h3>
                  </div>
                  <div className={`p-2 rounded-full ${style.container}`}>
                    <Icon size={20} strokeWidth={2.5} />
                  </div>
                </div>

                <div className="flex gap-3">
                  {card.fasting && (
                    <div className="flex-1">
                      <span className="font-label-caps text-label-caps text-primary">FASTING</span>
                      <p className="font-body-md text-lg font-semibold text-on-surface">
                        {formatDuration(card.fasting.start_time, card.fasting.end_time)}
                      </p>
                    </div>
                  )}
                  {card.eating && (
                    <div className="flex-1">
                      <span className="font-label-caps text-label-caps text-tertiary">EATING</span>
                      <p className="font-body-md text-lg font-semibold text-on-surface">
                        {formatDuration(card.eating.start_time, card.eating.end_time)}
                      </p>
                    </div>
                  )}
                </div>
              </motion.button>
            )
          })}
        </motion.div>
      )}

      <Modal isOpen={!!selectedCard} onClose={() => setSelectedCard(null)} title="Cycle details">
        {selectedCard && (() => {
          const phases = [
            { log: selectedCard.fasting, label: 'Fasting' },
            { log: selectedCard.eating, label: 'Eating window' },
          ].filter((p): p is { log: FastingLog; label: string } => !!p.log)

          return (
            <div className="flex flex-col gap-4">
              {phases.map(({ log, label }) => {
                const start = parseISO(log.start_time)
                const end = log.end_time ? parseISO(log.end_time) : null
                const style = statusStyle[log.status] ?? statusStyle.missed
                const Icon = style.icon
                const targetHours = Number(log.target_duration_hours) || 16

                return (
                  <div key={log.id}>
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`p-3 rounded-full ${style.container}`}>
                        <Icon size={24} strokeWidth={2.5} />
                      </div>
                      <div>
                        <p className="font-body-md font-semibold text-on-surface">{label} · {style.label}</p>
                        <p className="font-body-md text-sm text-on-surface-variant">
                          {format(start, 'MMMM d, yyyy')} · {formatTargetDuration(targetHours)} goal
                        </p>
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
              })}
            </div>
          )
        })()}
      </Modal>
    </div>
  )
}
