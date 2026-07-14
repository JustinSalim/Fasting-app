'use client'

import Link from 'next/link'
import { Sparkles, ArrowRight } from 'lucide-react'
import { AuthCard } from './AuthCard'
import { signup } from '@/app/(auth)/actions'

interface SignupViewProps {
  error?: string
}

export function SignupView({ error }: SignupViewProps) {
  return (
    <AuthCard icon={Sparkles} title="Antigravity" subtitle="Begin your journey of weightless mindfulness.">
      <form action={signup} className="flex flex-col gap-4">
        <input
          name="full_name"
          type="text"
          required
          placeholder="Full name"
          className="w-full bg-surface-container-low/50 hover:bg-surface-container-low focus:bg-surface-container-low transition-colors rounded-xl px-4 py-4 font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/50 border-none outline-none focus:ring-2 focus:ring-primary-fixed-dim"
        />
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
          minLength={6}
          placeholder="Password"
          className="w-full bg-surface-container-low/50 hover:bg-surface-container-low focus:bg-surface-container-low transition-colors rounded-xl px-4 py-4 font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/50 border-none outline-none focus:ring-2 focus:ring-primary-fixed-dim"
        />
        {error && <p className="font-body-md text-body-md text-error text-sm px-1">{error}</p>}
        <button
          type="submit"
          className="w-full py-4 rounded-full bg-surface hover:bg-surface-bright shadow-float hover:shadow-float-hover text-primary font-label-caps text-label-caps tracking-widest transition-all duration-300 ease-glide active:scale-[0.98] flex items-center justify-center gap-2 mt-2"
        >
          CONTINUE
          <ArrowRight size={18} />
        </button>
      </form>
      <p className="text-center font-body-md text-body-md text-on-surface-variant/60 text-sm px-4">
        Already have an account? <Link href="/login" className="text-primary hover:text-primary-fixed-dim transition-colors underline decoration-primary/30 underline-offset-4">Log in</Link>
      </p>
    </AuthCard>
  )
}
