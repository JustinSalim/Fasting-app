'use client'

import Link from 'next/link'
import { Sparkles, MailCheck, ArrowRight } from 'lucide-react'
import { AuthCard } from './AuthCard'
import { login } from '@/app/(auth)/actions'

interface LoginViewProps {
  error?: string
  message?: string
}

export function LoginView({ error, message }: LoginViewProps) {
  const isCheckEmailState = !!message && message.toLowerCase().includes('check email')

  if (isCheckEmailState) {
    return (
      <AuthCard icon={MailCheck} title="Check your email" subtitle="We've sent a gentle ping to your inbox. Tap the link to begin.">
        <Link
          href="/login"
          className="py-3 px-8 rounded-full bg-transparent hover:bg-surface-container-low transition-colors text-on-surface-variant font-label-caps text-label-caps tracking-widest flex items-center justify-center gap-2"
        >
          RETURN TO START
        </Link>
      </AuthCard>
    )
  }

  return (
    <AuthCard icon={Sparkles} title="Antigravity" subtitle="Welcome back to weightless mindfulness.">
      <form action={login} className="flex flex-col gap-4">
        <input
          name="email"
          type="email"
          required
          placeholder="Email address"
          className="w-full bg-surface-container-low/50 hover:bg-surface-container-low focus:bg-surface-container-low transition-colors rounded-xl px-4 py-4 font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/50 border-none outline-none focus:ring-2 focus:ring-primary-fixed-dim"
        />
        <input
          name="password"
          type="password"
          required
          placeholder="Password"
          className="w-full bg-surface-container-low/50 hover:bg-surface-container-low focus:bg-surface-container-low transition-colors rounded-xl px-4 py-4 font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/50 border-none outline-none focus:ring-2 focus:ring-primary-fixed-dim"
        />
        {(error || message) && (
          <p className="font-body-md text-body-md text-error text-sm px-1">{error || message}</p>
        )}
        <button
          type="submit"
          className="w-full py-4 rounded-full bg-surface hover:bg-surface-bright shadow-float hover:shadow-float-hover text-primary font-label-caps text-label-caps tracking-widest transition-all duration-300 ease-glide active:scale-[0.98] flex items-center justify-center gap-2 mt-2"
        >
          LOG IN
          <ArrowRight size={18} />
        </button>
      </form>
      <p className="text-center font-body-md text-body-md text-on-surface-variant text-sm px-4">
        New here? <Link href="/signup" className="text-primary hover:text-primary-fixed-dim transition-colors underline decoration-primary/30 underline-offset-4">Create an account</Link>
      </p>
    </AuthCard>
  )
}
