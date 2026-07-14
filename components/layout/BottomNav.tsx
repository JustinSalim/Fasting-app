'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Timer, BarChart3, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { name: 'Home', href: '/dashboard', icon: Timer, enabled: true },
  { name: 'Stats', href: '/dashboard', icon: BarChart3, enabled: false },
  { name: 'Settings', href: '/dashboard', icon: Settings, enabled: false },
]

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-48px)] max-w-md z-50 flex justify-around items-center p-2 bg-surface/90 dark:bg-surface-container/90 backdrop-blur-2xl rounded-full shadow-float">
      {navItems.map((item) =>
        item.enabled ? (
          <Link
            key={item.name}
            href={item.href}
            className={cn(
              'flex flex-col items-center justify-center rounded-full px-6 py-2 transition-colors',
              pathname === item.href ? 'text-primary bg-secondary-container/30' : 'text-on-surface-variant'
            )}
          >
            <item.icon size={20} />
          </Link>
        ) : (
          <div
            key={item.name}
            title={`${item.name} — coming soon`}
            className="flex flex-col items-center justify-center rounded-full px-6 py-2 text-on-surface-variant/30 cursor-not-allowed"
          >
            <item.icon size={20} />
          </div>
        )
      )}
    </nav>
  )
}
