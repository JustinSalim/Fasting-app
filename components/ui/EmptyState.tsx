import * as React from 'react'
import { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  subtitle: string
  children?: React.ReactNode
}

export function EmptyState({ icon: Icon, title, subtitle, children }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center text-center gap-3 py-4">
      <div className="w-14 h-14 rounded-full bg-surface-container flex items-center justify-center">
        <Icon className="text-on-surface-variant" size={24} strokeWidth={1.5} />
      </div>
      <div className="flex flex-col gap-1">
        <p className="font-body-md font-semibold text-on-surface">{title}</p>
        <p className="font-body-md text-sm text-on-surface-variant">{subtitle}</p>
      </div>
      {children}
    </div>
  )
}
