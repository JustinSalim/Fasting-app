import * as React from 'react'
import { LucideIcon } from 'lucide-react'

interface AuthCardProps {
  icon: LucideIcon
  title: string
  subtitle: string
  children: React.ReactNode
}

export function AuthCard({ icon: Icon, title, subtitle, children }: AuthCardProps) {
  return (
    <main className="w-full max-w-md relative z-10 mx-auto">
      <div className="flex flex-col gap-section-padding">
        <header className="text-center flex flex-col items-center gap-stack-gap">
          <div className="w-16 h-16 rounded-full bg-surface shadow-float flex items-center justify-center mb-4">
            <Icon className="text-primary" size={28} strokeWidth={1.5} />
          </div>
          <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-primary tracking-tighter">
            {title}
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant max-w-[260px]">
            {subtitle}
          </p>
        </header>
        <div className="bg-surface/70 backdrop-blur-xl rounded-3xl p-8 shadow-float flex flex-col gap-6">
          {children}
        </div>
      </div>
    </main>
  )
}
