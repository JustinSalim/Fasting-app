'use client'

import * as React from 'react'
import { useRouter, usePathname } from 'next/navigation'

const SWIPE_ROUTES = ['/dashboard', '/stats', '/history', '/settings']
const SWIPE_THRESHOLD = 60
// A swipe only counts as horizontal if it moves clearly more sideways than up/down.
const AXIS_RATIO = 1.5

export function SwipeNavigator({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const start = React.useRef<{ x: number; y: number } | null>(null)

  // Warm the neighbouring routes so the push after a swipe lands fast.
  React.useEffect(() => {
    const index = SWIPE_ROUTES.indexOf(pathname)
    if (index === -1) return
    if (index > 0) router.prefetch(SWIPE_ROUTES[index - 1])
    if (index < SWIPE_ROUTES.length - 1) router.prefetch(SWIPE_ROUTES[index + 1])
  }, [pathname, router])

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    start.current = { x: t.clientX, y: t.clientY }
  }

  const onTouchEnd = (e: React.TouchEvent) => {
    if (!start.current) return
    const t = e.changedTouches[0]
    const dx = t.clientX - start.current.x
    const dy = t.clientY - start.current.y
    start.current = null

    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy) * AXIS_RATIO) return

    const index = SWIPE_ROUTES.indexOf(pathname)
    if (index === -1) return
    if (dx < 0 && index < SWIPE_ROUTES.length - 1) router.push(SWIPE_ROUTES[index + 1])
    else if (dx > 0 && index > 0) router.push(SWIPE_ROUTES[index - 1])
  }

  return (
    <div
      className="flex flex-col flex-1 w-full"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {children}
    </div>
  )
}
