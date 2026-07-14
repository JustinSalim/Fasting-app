'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}

export function Modal({ isOpen, onClose, title, children }: ModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <React.Fragment>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-on-background/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ ease: [0.2, 0.8, 0.2, 1], duration: 0.3 }}
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-surface p-6 shadow-float"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">{title}</h2>
              <button
                onClick={onClose}
                className="rounded-full p-1 hover:bg-surface-container-low text-on-surface transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            {children}
          </motion.div>
        </React.Fragment>
      )}
    </AnimatePresence>
  )
}
