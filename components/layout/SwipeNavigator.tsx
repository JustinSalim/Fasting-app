'use client'

import * as React from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { motion, type PanInfo } from 'framer-motion'

const SWIPE_ROUTES = ['/dashboard', '/stats', '/history', '/settings']
const SWIPE_THRESHOLD = 60

export function SwipeNavigator({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()

  const handlePanEnd = (_e: PointerEvent, info: PanInfo) => {
    const index = SWIPE_ROUTES.indexOf(pathname)
    if (index === -1) return

    if (info.offset.x <= -SWIPE_THRESHOLD && index < SWIPE_ROUTES.length - 1) {
      router.push(SWIPE_ROUTES[index + 1])
    } else if (info.offset.x >= SWIPE_THRESHOLD && index > 0) {
      router.push(SWIPE_ROUTES[index - 1])
    }
  }

  return (
    <motion.div
      className="flex flex-col flex-1 w-full"
      onPanEnd={handlePanEnd}
    >
      {children}
    </motion.div>
  )
}
