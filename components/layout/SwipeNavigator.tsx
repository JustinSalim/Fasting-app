'use client'

import * as React from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { motion, AnimatePresence, useMotionValue, type PanInfo } from 'framer-motion'

const SWIPE_ROUTES = ['/dashboard', '/stats', '/history', '/settings']
const SWIPE_THRESHOLD = 60

export function SwipeNavigator({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const x = useMotionValue(0)
  const [direction, setDirection] = React.useState(0)

  const handleDragEnd = (_e: PointerEvent, info: PanInfo) => {
    x.set(0)
    const index = SWIPE_ROUTES.indexOf(pathname)
    if (index === -1) return

    if (info.offset.x <= -SWIPE_THRESHOLD && index < SWIPE_ROUTES.length - 1) {
      setDirection(1)
      router.push(SWIPE_ROUTES[index + 1])
    } else if (info.offset.x >= SWIPE_THRESHOLD && index > 0) {
      setDirection(-1)
      router.push(SWIPE_ROUTES[index - 1])
    }
  }

  return (
    <div className="relative flex flex-col flex-1 w-full overflow-x-hidden">
      <AnimatePresence initial={false} mode="wait" custom={direction}>
        <motion.div
          key={pathname}
          className="flex flex-col flex-1 w-full"
          style={{ x, touchAction: 'pan-y' }}
          drag="x"
          dragElastic={0.15}
          dragConstraints={{ left: 0, right: 0 }}
          dragDirectionLock
          onDragEnd={handleDragEnd}
          custom={direction}
          initial={{ x: direction * 60, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: direction * -60, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 500, damping: 45 }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
