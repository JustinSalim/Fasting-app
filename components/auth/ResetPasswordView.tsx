'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { KeyRound, ArrowRight } from 'lucide-react'
import { AuthCard } from './AuthCard'
import { createClient } from '@/utils/supabase/client'

export function ResetPasswordView() {
  const router = useRouter()
  const [password, setPassword] = React.useState('')
  const [confirmPassword, setConfirmPassword] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [isSaving, setIsSaving] = React.useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    setIsSaving(true)
    const supabase = createClient()
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setIsSaving(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    router.push('/dashboard')
  }

  return (
    <AuthCard icon={KeyRound} title="Set new password" subtitle="Choose a new password for your account.">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input
          type="password"
          required
          placeholder="New password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full bg-surface-container-low/50 hover:bg-surface-container-low focus:bg-surface-container-low transition-colors rounded-xl px-4 py-4 font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/50 border-none outline-none focus:ring-2 focus:ring-primary-fixed-dim"
        />
        <input
          type="password"
          required
          placeholder="Confirm new password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full bg-surface-container-low/50 hover:bg-surface-container-low focus:bg-surface-container-low transition-colors rounded-xl px-4 py-4 font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/50 border-none outline-none focus:ring-2 focus:ring-primary-fixed-dim"
        />
        {error && <p className="font-body-md text-body-md text-error text-sm px-1">{error}</p>}
        <button
          type="submit"
          disabled={isSaving}
          className="w-full py-4 rounded-full bg-surface hover:bg-surface-bright shadow-float hover:shadow-float-hover text-primary font-label-caps text-label-caps tracking-widest transition-all duration-300 ease-glide active:scale-[0.98] flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
        >
          {isSaving ? 'SAVING...' : 'SET PASSWORD'}
          <ArrowRight size={18} />
        </button>
      </form>
    </AuthCard>
  )
}
