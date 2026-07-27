'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/utils/supabase/server'

export async function login(formData: FormData) {
  const supabase = await createClient()

  const data = {
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  }

  const { error } = await supabase.auth.signInWithPassword(data)

  if (error) {
    redirect('/login?error=' + error.message)
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}

export async function signup(formData: FormData) {
  const supabase = await createClient()
  const headersList = await headers()

  const origin = resolveOrigin(headersList)

  const data = {
    email: formData.get('email') as string,
    password: formData.get('password') as string,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
      data: {
        full_name: formData.get('full_name') as string,
      }
    }
  }

  const { error } = await supabase.auth.signUp(data)

  if (error) {
    if (error.message.toLowerCase().includes('already registered')) {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: data.email,
        options: {
          emailRedirectTo: `${origin}/auth/callback`
        }
      })
      if (resendError) {
        if (resendError.message.toLowerCase().includes('already verified') || resendError.status === 422) {
          redirect('/login?error=Account already exists. Please log in.')
        } else {
          redirect('/signup?error=' + resendError.message)
        }
      } else {
        redirect('/login?message=Verification email resent. Check email to continue.')
      }
    } else {
      redirect('/signup?error=' + error.message)
    }
  }

  revalidatePath('/', 'layout')
  redirect('/login?message=Check email to continue sign in process')
}

function resolveOrigin(headersList: Awaited<ReturnType<typeof headers>>) {
  let origin = headersList.get('origin') || process.env.NEXT_PUBLIC_SITE_URL
  if (!origin && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    origin = `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  }
  if (!origin && process.env.VERCEL_URL) {
    origin = `https://${process.env.VERCEL_URL}`
  }
  return origin || 'http://localhost:3000'
}

export async function requestPasswordReset(formData: FormData) {
  const supabase = await createClient()
  const headersList = await headers()
  const origin = resolveOrigin(headersList)
  const email = formData.get('email') as string

  // Supabase enforces its own resend cooldown and link expiry (default 1h;
  // this project's project-level Auth setting is set to 5 minutes) — no
  // custom token/expiry tracking needed here.
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  })

  if (error) {
    redirect('/forgot-password?error=' + error.message)
  }

  redirect('/forgot-password?message=Check email for a reset link. It expires in 5 minutes.')
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}
