# Antigravity Fasting Tracker V2 — MVP (Auth + Timer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working Next.js app in `fastingv2` where a user can sign up, verify their email, log in, start a fast (preset or custom duration), watch a live elapsed-time countdown, and stop the fast — all persisted to the same Supabase project as v1, styled with the Antigravity design system.

**Architecture:** Supabase server client fetches the current profile and any `ongoing` `fasting_logs` row inside a Server Component (`app/(app)/layout.tsx`), which seeds a client-side `FastingProvider` context. Start/stop actions are Next.js Server Actions writing directly to `fasting_logs`. The live countdown ticks client-side off `startTime`/`targetDuration` — no polling. This mirrors v1's proven pattern; only the visual layer and a couple of pure-logic helpers are new.

**Tech Stack:** Next.js 16.2.10 (App Router), React 19, `@supabase/ssr` + `@supabase/supabase-js`, Tailwind CSS 4 (CSS-first `@theme`), framer-motion, date-fns, next-themes, lucide-react, Vitest (pure-logic unit tests only).

## Global Constraints

- Reuse the existing Supabase project — copy `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from `Desktop/1. Programming/NextJS/fasting/.env.local`. Do not create new tables/migrations; `profiles` and `fasting_logs` already exist and are sufficient for this phase.
- Package manager is `pnpm` (matches both v1 and the existing `fastingv2` scaffold's `pnpm-lock.yaml`/`pnpm-workspace.yaml`).
- Next.js 16.2.10 requires the middleware file to be named `proxy.ts` at the project root exporting `proxy` (not `middleware.ts`/`middleware`) — this is a compatibility fix already applied in v1; replicate it exactly.
- Dark mode via `next-themes` with the `class` strategy + Tailwind's `@custom-variant dark (&:is(.dark *));` — one component tree, no separate light/dark files.
- Icon set is `lucide-react` (already a proven v1 dependency), substituting for the Material Symbols icons used in the Stitch mockups. This is a deliberate, accepted deviation from pixel-perfect mockup fidelity (see spec's "Open questions" section).
- Out of scope, do not build: Your Journey (analytics/calendar), Reminders (scheduled push notifications), health logs, avatar upload, forgot-password, Vercel deployment, E2E/component tests. The bottom nav still renders Stats/Settings tabs as dimmed, non-navigating stubs.
- No placeholder content, no `alert()`-based error UI — errors render inline in the form/card that produced them.

---

## File Structure

```
fastingv2/
  .env.local                                  # copied from v1 (not committed)
  package.json                                # + supabase/framer-motion/date-fns/next-themes/lucide-react/vitest
  proxy.ts                                     # root middleware (Next 16 naming)
  utils/supabase/client.ts                     # ported verbatim from v1
  utils/supabase/server.ts                     # ported verbatim from v1
  utils/supabase/middleware.ts                 # ported verbatim from v1
  lib/utils.ts                                 # `cn` helper, ported verbatim from v1
  lib/fasting.ts                               # NEW pure logic: formatElapsed, getFastingStage, computeStopOutcome
  lib/fasting.test.ts                          # NEW Vitest tests for the above
  app/globals.css                              # REWRITTEN: Antigravity CSS-variable theme (light+dark)
  app/providers.tsx                            # ThemeProvider wrapper, ported verbatim from v1
  app/layout.tsx                               # REWRITTEN: Outfit/Plus Jakarta Sans/Space Grotesk fonts + ThemeProvider
  app/page.tsx                                 # REWRITTEN: redirect('/dashboard')
  app/(auth)/actions.ts                        # ported verbatim from v1 (login, signup)
  app/(auth)/login/page.tsx                    # NEW server component, reads searchParams
  app/(auth)/signup/page.tsx                   # NEW server component, reads searchParams
  app/auth/callback/route.ts                   # ported verbatim from v1
  components/auth/AuthCard.tsx                 # NEW presentational wrapper (glass-panel + header)
  components/auth/LoginView.tsx                # NEW client component: form OR "check your email" success view
  components/auth/SignupView.tsx               # NEW client component: signup form
  app/(app)/layout.tsx                         # NEW: fetches user+ongoing fast, wraps FastingProvider + BottomNav
  app/(app)/dashboard/page.tsx                 # NEW server component: fetches profile, passes to client
  app/(app)/dashboard/DashboardClient.tsx       # NEW: composes timer UI, matches fasting_timer mockup
  components/fasting/FastingContext.tsx         # ported verbatim from v1
  components/fasting/DurationSelector.tsx       # NEW, restyled Antigravity pill buttons (2/4/6/8H + Custom)
  components/fasting/ElapsedClock.tsx           # NEW: display-clock typography, ticking elapsed HH:MM
  components/ui/Modal.tsx                       # ported from v1, restyled with Antigravity tokens
  components/layout/BottomNav.tsx               # NEW: floating pill nav, Home functional + Stats/Settings stubs
  app/actions/fasting.ts                        # ported from v1 (startFastingLog, updateFastingLog, cancelFastingLog)
  public/manifest.json                          # REWRITTEN: Antigravity name/colors (icons remain a known gap, same as v1)
  vitest.config.ts                              # NEW: minimal config so `pnpm test` picks up *.test.ts
```

---

### Task 1: Foundation — dependencies, Supabase utils, middleware

**Files:**
- Modify: `package.json`
- Create: `.env.local`
- Create: `utils/supabase/client.ts`
- Create: `utils/supabase/server.ts`
- Create: `utils/supabase/middleware.ts`
- Create: `proxy.ts`
- Create: `lib/utils.ts`

**Interfaces:**
- Produces: `createClient()` (browser, from `utils/supabase/client.ts`), `createClient()` (server/async, from `utils/supabase/server.ts`), `updateSession(request: NextRequest)` (from `utils/supabase/middleware.ts`), `cn(...inputs: ClassValue[]): string` (from `lib/utils.ts`). All later tasks that touch Supabase or conditional class names import from these exact paths.

- [ ] **Step 1: Install dependencies**

```bash
cd "/Users/justin/Desktop/1. Programming/NextJS/fastingv2"
pnpm add @supabase/ssr@^0.12.0 @supabase/supabase-js@^2.110.1 clsx@^2.1.1 date-fns@^4.4.0 framer-motion@^12.42.2 lucide-react@^1.23.0 next-themes@^0.4.6 tailwind-merge@^3.6.0
pnpm add -D vitest
```

- [ ] **Step 2: Copy Supabase credentials from v1**

```bash
grep -E '^(NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY)=' \
  "/Users/justin/Desktop/1. Programming/NextJS/fasting/.env.local" \
  > "/Users/justin/Desktop/1. Programming/NextJS/fastingv2/.env.local"
cat "/Users/justin/Desktop/1. Programming/NextJS/fastingv2/.env.local"
```

Expected: two lines, `NEXT_PUBLIC_SUPABASE_URL=...` and `NEXT_PUBLIC_SUPABASE_ANON_KEY=...`. (`.env.local` is already covered by the scaffold's `.gitignore` — verify with `git check-ignore .env.local` before committing anything.)

- [ ] **Step 3: Create the Supabase browser client**

`utils/supabase/client.ts`:
```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 4: Create the Supabase server client**

`utils/supabase/server.ts`:
```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
}
```

- [ ] **Step 5: Create the session-refresh middleware logic**

`utils/supabase/middleware.ts`:
```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isAuthRoute = request.nextUrl.pathname.startsWith('/login') ||
                      request.nextUrl.pathname.startsWith('/signup') ||
                      request.nextUrl.pathname.startsWith('/auth')

  const isPublicRoute = request.nextUrl.pathname === '/' || request.nextUrl.pathname === '/manifest.json' || request.nextUrl.pathname.startsWith('/icon')

  if (!user && !isAuthRoute && !isPublicRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && !user.email_confirmed_at && !isAuthRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('message', 'Please verify your email to continue.')
    return NextResponse.redirect(url)
  }

  if (user && user.email_confirmed_at && isAuthRoute) {
     const url = request.nextUrl.clone()
     url.pathname = '/dashboard'
     return NextResponse.redirect(url)
  }

  return supabaseResponse
}
```

- [ ] **Step 6: Create the root proxy (middleware) entrypoint**

`proxy.ts`:
```typescript
import { type NextRequest } from 'next/server'
import { updateSession } from './utils/supabase/middleware'

export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

- [ ] **Step 7: Create the `cn` class-name helper**

`lib/utils.ts`:
```typescript
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

- [ ] **Step 8: Verify the server boots without crashing**

```bash
cd "/Users/justin/Desktop/1. Programming/NextJS/fastingv2"
pnpm dev &
sleep 3
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/
kill %1
```

Expected: an HTTP status (200, 307, or 404 are all fine at this stage — the auth/dashboard routes don't exist yet). What you must NOT see is a 500 or a stack trace in the `pnpm dev` output — that would mean the middleware or Supabase clients failed to load.

- [ ] **Step 9: Commit**

```bash
git add package.json pnpm-lock.yaml utils/ proxy.ts lib/utils.ts .gitignore
git commit -m "feat: add Supabase auth utilities and session middleware"
```

---

### Task 2: Antigravity design tokens — theme, fonts, dark mode

**Files:**
- Modify: `app/globals.css`
- Create: `app/providers.tsx`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: CSS custom properties consumable as Tailwind utilities (`bg-background`, `text-on-surface`, `bg-primary-container`, `shadow-float`, `hover:shadow-float-hover`, `animate-float`, `animate-pulse-glow`, `ease-glide`, `p-container-margin`/`gap-stack-gap`/`py-section-padding`/`p-inner-padding`, `font-display-clock`/`text-display-clock`, `font-headline-lg`, `font-headline-lg-mobile`, `font-body-md`, `font-label-caps`). `ThemeProvider` component from `app/providers.tsx`, used by `app/layout.tsx` and later by every page.

- [ ] **Step 1: Rewrite the global stylesheet with the full Antigravity token set**

`app/globals.css`:
```css
@import "tailwindcss";

@custom-variant dark (&:is(.dark *));

:root {
  --color-background: #fbf9f5;
  --color-on-background: #1b1c1a;
  --color-surface: #fbf9f5;
  --color-surface-bright: #fbf9f5;
  --color-surface-dim: #dbdad6;
  --color-surface-container-lowest: #ffffff;
  --color-surface-container-low: #f5f3ef;
  --color-surface-container: #f0eeea;
  --color-surface-container-high: #eae8e4;
  --color-surface-container-highest: #e4e2de;
  --color-surface-variant: #e4e2de;
  --color-surface-tint: #825500;
  --color-on-surface: #1b1c1a;
  --color-on-surface-variant: #514536;

  --color-primary: #825500;
  --color-on-primary: #ffffff;
  --color-primary-container: #ffb84c;
  --color-on-primary-container: #714a00;
  --color-primary-fixed: #ffddb3;
  --color-primary-fixed-dim: #ffb950;
  --color-on-primary-fixed: #291800;
  --color-on-primary-fixed-variant: #633f00;

  --color-secondary: #4f652d;
  --color-on-secondary: #ffffff;
  --color-secondary-container: #cee9a2;
  --color-on-secondary-container: #536a30;
  --color-secondary-fixed: #d1eca5;
  --color-secondary-fixed-dim: #b5d08b;
  --color-on-secondary-fixed: #121f00;
  --color-on-secondary-fixed-variant: #384d17;

  --color-tertiary: #5c5e66;
  --color-on-tertiary: #ffffff;
  --color-tertiary-container: #c4c5cf;
  --color-on-tertiary-container: #50515a;
  --color-tertiary-fixed: #e2e2ec;
  --color-tertiary-fixed-dim: #c5c6cf;
  --color-on-tertiary-fixed: #191b22;
  --color-on-tertiary-fixed-variant: #45464e;

  --color-outline: #837563;
  --color-outline-variant: #d6c4b0;
  --color-inverse-surface: #30312e;
  --color-inverse-on-surface: #f2f0ec;
  --color-inverse-primary: #ffb950;

  --color-error: #ba1a1a;
  --color-on-error: #ffffff;
  --color-error-container: #ffdad6;
  --color-on-error-container: #93000a;
}

.dark {
  --color-background: #1A1C23;
  --color-on-background: #ffffff;
  --color-surface: #1A1C23;
  --color-surface-bright: #252731;
  --color-surface-dim: #dbdad6;
  --color-surface-container-lowest: #15171d;
  --color-surface-container-low: #1D1F28;
  --color-surface-container: #22242D;
  --color-surface-container-high: #2A2C35;
  --color-surface-container-highest: #323540;
  --color-surface-variant: #e4e2de;
  --color-surface-tint: #825500;
  --color-on-surface: #ffffff;
  --color-on-surface-variant: #C5C6CC;

  --color-primary: #ffb950;
  --color-on-primary: #ffffff;
  --color-primary-container: #ffb84c;
  --color-on-primary-container: #714a00;
  --color-primary-fixed: #ffddb3;
  --color-primary-fixed-dim: #ffb950;
  --color-on-primary-fixed: #291800;
  --color-on-primary-fixed-variant: #633f00;

  --color-secondary: #d1eca5;
  --color-on-secondary: #1A1C23;
  --color-secondary-container: #cee9a2;
  --color-on-secondary-container: #536a30;
  --color-secondary-fixed: #d1eca5;
  --color-secondary-fixed-dim: #b5d08b;
  --color-on-secondary-fixed: #121f00;
  --color-on-secondary-fixed-variant: #384d17;

  --color-tertiary: #5c5e66;
  --color-on-tertiary: #ffffff;
  --color-tertiary-container: #c4c5cf;
  --color-on-tertiary-container: #50515a;
  --color-tertiary-fixed: #e2e2ec;
  --color-tertiary-fixed-dim: #c5c6cf;
  --color-on-tertiary-fixed: #191b22;
  --color-on-tertiary-fixed-variant: #45464e;

  --color-outline: #837563;
  --color-outline-variant: #4A4D59;
  --color-inverse-surface: #fbf9f5;
  --color-inverse-on-surface: #f2f0ec;
  --color-inverse-primary: #ffb950;

  --color-error: #ba1a1a;
  --color-on-error: #ffffff;
  --color-error-container: #ffdad6;
  --color-on-error-container: #93000a;
}

@theme inline {
  --color-background: var(--color-background);
  --color-on-background: var(--color-on-background);
  --color-surface: var(--color-surface);
  --color-surface-bright: var(--color-surface-bright);
  --color-surface-dim: var(--color-surface-dim);
  --color-surface-container-lowest: var(--color-surface-container-lowest);
  --color-surface-container-low: var(--color-surface-container-low);
  --color-surface-container: var(--color-surface-container);
  --color-surface-container-high: var(--color-surface-container-high);
  --color-surface-container-highest: var(--color-surface-container-highest);
  --color-surface-variant: var(--color-surface-variant);
  --color-surface-tint: var(--color-surface-tint);
  --color-on-surface: var(--color-on-surface);
  --color-on-surface-variant: var(--color-on-surface-variant);

  --color-primary: var(--color-primary);
  --color-on-primary: var(--color-on-primary);
  --color-primary-container: var(--color-primary-container);
  --color-on-primary-container: var(--color-on-primary-container);
  --color-primary-fixed: var(--color-primary-fixed);
  --color-primary-fixed-dim: var(--color-primary-fixed-dim);
  --color-on-primary-fixed: var(--color-on-primary-fixed);
  --color-on-primary-fixed-variant: var(--color-on-primary-fixed-variant);

  --color-secondary: var(--color-secondary);
  --color-on-secondary: var(--color-on-secondary);
  --color-secondary-container: var(--color-secondary-container);
  --color-on-secondary-container: var(--color-on-secondary-container);
  --color-secondary-fixed: var(--color-secondary-fixed);
  --color-secondary-fixed-dim: var(--color-secondary-fixed-dim);
  --color-on-secondary-fixed: var(--color-on-secondary-fixed);
  --color-on-secondary-fixed-variant: var(--color-on-secondary-fixed-variant);

  --color-tertiary: var(--color-tertiary);
  --color-on-tertiary: var(--color-on-tertiary);
  --color-tertiary-container: var(--color-tertiary-container);
  --color-on-tertiary-container: var(--color-on-tertiary-container);
  --color-tertiary-fixed: var(--color-tertiary-fixed);
  --color-tertiary-fixed-dim: var(--color-tertiary-fixed-dim);
  --color-on-tertiary-fixed: var(--color-on-tertiary-fixed);
  --color-on-tertiary-fixed-variant: var(--color-on-tertiary-fixed-variant);

  --color-outline: var(--color-outline);
  --color-outline-variant: var(--color-outline-variant);
  --color-inverse-surface: var(--color-inverse-surface);
  --color-inverse-on-surface: var(--color-inverse-on-surface);
  --color-inverse-primary: var(--color-inverse-primary);

  --color-error: var(--color-error);
  --color-on-error: var(--color-on-error);
  --color-error-container: var(--color-error-container);
  --color-on-error-container: var(--color-on-error-container);

  --spacing-container-margin: 24px;
  --spacing-stack-gap: 16px;
  --spacing-section-padding: 40px;
  --spacing-inner-padding: 20px;

  --font-display-clock: var(--font-outfit);
  --text-display-clock: 80px;
  --text-display-clock--line-height: 80px;
  --text-display-clock--letter-spacing: -0.04em;
  --text-display-clock--font-weight: 200;

  --font-headline-lg: var(--font-outfit);
  --text-headline-lg: 32px;
  --text-headline-lg--line-height: 40px;
  --text-headline-lg--letter-spacing: -0.02em;
  --text-headline-lg--font-weight: 300;

  --font-headline-lg-mobile: var(--font-outfit);
  --text-headline-lg-mobile: 28px;
  --text-headline-lg-mobile--line-height: 36px;
  --text-headline-lg-mobile--font-weight: 300;

  --font-body-md: var(--font-plus-jakarta);
  --text-body-md: 16px;
  --text-body-md--line-height: 24px;
  --text-body-md--font-weight: 400;

  --font-label-caps: var(--font-space-grotesk);
  --text-label-caps: 12px;
  --text-label-caps--line-height: 16px;
  --text-label-caps--letter-spacing: 0.1em;
  --text-label-caps--font-weight: 500;

  --shadow-float: 0 20px 50px -10px rgba(0,0,0,0.03);
  --shadow-float-hover: 0 30px 60px -15px rgba(0,0,0,0.05);

  --ease-glide: cubic-bezier(0.2, 0.8, 0.2, 1);

  --animate-float: float 6s ease-in-out infinite;
  --animate-pulse-glow: pulse-glow 3s ease-in-out infinite;
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

@keyframes pulse-glow {
  0%, 100% { box-shadow: 0 0 0 0 rgba(255, 184, 76, 0.35); }
  50% { box-shadow: 0 0 0 16px rgba(255, 184, 76, 0); }
}

body {
  background: var(--color-background);
  color: var(--color-on-surface);
  min-height: 100vh;
}
```

- [ ] **Step 2: Create the theme provider**

`app/providers.tsx`:
```typescript
'use client'

import * as React from 'react'
import { ThemeProvider as NextThemesProvider } from 'next-themes'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return <NextThemesProvider attribute="class" defaultTheme="system" enableSystem>{children}</NextThemesProvider>
}
```

- [ ] **Step 3: Rewrite the root layout with Antigravity fonts**

`app/layout.tsx`:
```typescript
import type { Metadata, Viewport } from "next";
import { Outfit, Plus_Jakarta_Sans, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "./providers";

const outfit = Outfit({
  variable: "--font-outfit",
  weight: ["200", "300", "400", "500", "600", "700"],
  subsets: ["latin"],
});

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  weight: ["500", "600"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Antigravity",
  description: "A weightless, mindful intermittent fasting tracker",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#F6F4F0",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${outfit.variable} ${plusJakarta.variable} ${spaceGrotesk.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col font-body-md">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Verify the build compiles**

```bash
cd "/Users/justin/Desktop/1. Programming/NextJS/fastingv2"
pnpm build
```

Expected: build succeeds (exit code 0). Any Tailwind `@theme`/CSS syntax error or missing-token error will surface here as a build failure — fix before moving on.

- [ ] **Step 5: Commit**

```bash
git add app/globals.css app/providers.tsx app/layout.tsx
git commit -m "feat: add Antigravity design system tokens, fonts, and dark mode"
```

---

### Task 3: Pure fasting logic (TDD)

**Files:**
- Create: `lib/fasting.ts`
- Create: `lib/fasting.test.ts`
- Create: `vitest.config.ts`
- Modify: `package.json` (add `test` script)

**Interfaces:**
- Produces: `formatElapsed(totalSeconds: number): string`, `getFastingStage(elapsedHours: number): 'fasting' | 'fat_burning'`, `computeStopOutcome(startTime: Date, targetHours: number, now: Date, thresholdMinutes?: number): { action: 'discard' } | { action: 'save'; status: 'completed' | 'missed' }`. `DashboardClient.tsx` (Task 6) imports all three from `@/lib/fasting`.

- [ ] **Step 1: Add the Vitest config and test script**

`vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
  },
})
```

In `package.json`, add to `"scripts"`:
```json
"test": "vitest run"
```

- [ ] **Step 2: Write the failing tests**

`lib/fasting.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { formatElapsed, getFastingStage, computeStopOutcome } from './fasting'

describe('formatElapsed', () => {
  it('formats seconds under an hour', () => {
    expect(formatElapsed(125)).toBe('00:02')
  })

  it('formats hours and minutes, zero-padded', () => {
    expect(formatElapsed(3 * 3600 + 5 * 60 + 40)).toBe('03:05')
  })

  it('does not wrap past 24 hours', () => {
    expect(formatElapsed(30 * 3600 + 15 * 60)).toBe('30:15')
  })
})

describe('getFastingStage', () => {
  it('is "fasting" before the 12-hour mark', () => {
    expect(getFastingStage(0)).toBe('fasting')
    expect(getFastingStage(11.9)).toBe('fasting')
  })

  it('is "fat_burning" at and after the 12-hour mark', () => {
    expect(getFastingStage(12)).toBe('fat_burning')
    expect(getFastingStage(20)).toBe('fat_burning')
  })
})

describe('computeStopOutcome', () => {
  const start = new Date('2026-07-15T08:00:00.000Z')

  it('discards fasts shorter than the threshold (default 5 minutes)', () => {
    const now = new Date('2026-07-15T08:04:59.000Z')
    expect(computeStopOutcome(start, 16, now)).toEqual({ action: 'discard' })
  })

  it('saves as "missed" when stopped before the target duration', () => {
    const now = new Date('2026-07-15T14:00:00.000Z') // 6h elapsed of a 16h target
    expect(computeStopOutcome(start, 16, now)).toEqual({ action: 'save', status: 'missed' })
  })

  it('saves as "completed" when stopped at or after the target duration', () => {
    const now = new Date('2026-07-16T00:00:00.000Z') // 16h elapsed of a 16h target
    expect(computeStopOutcome(start, 16, now)).toEqual({ action: 'save', status: 'completed' })
  })

  it('respects a custom threshold', () => {
    const now = new Date('2026-07-15T08:02:00.000Z') // 2 minutes elapsed
    expect(computeStopOutcome(start, 16, now, 1)).toEqual({ action: 'save', status: 'missed' })
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd "/Users/justin/Desktop/1. Programming/NextJS/fastingv2"
pnpm test
```

Expected: FAIL — `lib/fasting.ts` doesn't exist yet, so the import errors out.

- [ ] **Step 4: Implement the pure logic**

`lib/fasting.ts`:
```typescript
export function formatElapsed(totalSeconds: number): string {
  const totalMinutes = Math.floor(totalSeconds / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)
  return `${pad(hours)}:${pad(minutes)}`
}

export function getFastingStage(elapsedHours: number): 'fasting' | 'fat_burning' {
  return elapsedHours >= 12 ? 'fat_burning' : 'fasting'
}

export function computeStopOutcome(
  startTime: Date,
  targetHours: number,
  now: Date,
  thresholdMinutes = 5
): { action: 'discard' } | { action: 'save'; status: 'completed' | 'missed' } {
  const elapsedMinutes = (now.getTime() - startTime.getTime()) / 60000

  if (elapsedMinutes < thresholdMinutes) {
    return { action: 'discard' }
  }

  const status = elapsedMinutes >= targetHours * 60 ? 'completed' : 'missed'
  return { action: 'save', status }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm test
```

Expected: PASS — all 9 tests green.

- [ ] **Step 6: Commit**

```bash
git add lib/fasting.ts lib/fasting.test.ts vitest.config.ts package.json pnpm-lock.yaml
git commit -m "feat: add pure fasting-status logic with unit tests"
```

---

### Task 4: Auth — login/signup pages, actions, callback

**Files:**
- Create: `app/(auth)/actions.ts`
- Create: `app/auth/callback/route.ts`
- Create: `components/auth/AuthCard.tsx`
- Create: `components/auth/LoginView.tsx`
- Create: `components/auth/SignupView.tsx`
- Create: `app/(auth)/login/page.tsx`
- Create: `app/(auth)/signup/page.tsx`

**Interfaces:**
- Consumes: `createClient()` from `@/utils/supabase/server` (Task 1).
- Produces: `login(formData: FormData)`, `signup(formData: FormData)` server actions from `@/app/(auth)/actions`. Route `/auth/callback`. Pages at `/login`, `/signup`.

- [ ] **Step 1: Port the auth server actions verbatim**

`app/(auth)/actions.ts`:
```typescript
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

  let origin = headersList.get('origin') || process.env.NEXT_PUBLIC_SITE_URL
  if (!origin && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    origin = `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  }
  if (!origin && process.env.VERCEL_URL) {
    origin = `https://${process.env.VERCEL_URL}`
  }
  if (!origin) {
    origin = 'http://localhost:3000'
  }

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
```

- [ ] **Step 2: Port the email verification callback route verbatim**

`app/auth/callback/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=Verification failed. Please try signing up again.`)
}
```

- [ ] **Step 3: Build the shared auth card wrapper**

`components/auth/AuthCard.tsx`:
```typescript
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
```

- [ ] **Step 4: Build the login view (form + "check your email" success state)**

`components/auth/LoginView.tsx`:
```typescript
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
      <p className="text-center font-body-md text-body-md text-on-surface-variant/60 text-sm px-4">
        New here? <Link href="/signup" className="text-primary hover:text-primary-fixed-dim transition-colors underline decoration-primary/30 underline-offset-4">Create an account</Link>
      </p>
    </AuthCard>
  )
}
```

- [ ] **Step 5: Build the signup view**

`components/auth/SignupView.tsx`:
```typescript
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
```

- [ ] **Step 6: Wire up the route pages**

`app/(auth)/login/page.tsx`:
```typescript
import { LoginView } from '@/components/auth/LoginView'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>
}) {
  const { error, message } = await searchParams
  return (
    <div className="min-h-screen flex items-center justify-center p-container-margin bg-background">
      <LoginView error={error} message={message} />
    </div>
  )
}
```

`app/(auth)/signup/page.tsx`:
```typescript
import { SignupView } from '@/components/auth/SignupView'

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  return (
    <div className="min-h-screen flex items-center justify-center p-container-margin bg-background">
      <SignupView error={error} />
    </div>
  )
}
```

- [ ] **Step 7: Verify manually**

```bash
cd "/Users/justin/Desktop/1. Programming/NextJS/fastingv2"
pnpm dev
```

In a browser, visit `http://localhost:3000/signup`: confirm the Antigravity-styled card renders (soft sand background, pill inputs, "CONTINUE" button). Submit with a real email you can access, a full name, and a password — confirm you're redirected to `/login` showing the "Check your email" success view (mail icon, pulsing card). Check that email, click the verification link, confirm it redirects to `/dashboard` (a 404 is expected here since Task 5/6 haven't built the dashboard yet — a working redirect target, not a 500, is what you're checking). Then visit `/login` directly and log in with the same credentials — confirm redirect to `/dashboard`.

This flow depends on real email delivery from the shared Supabase project and can't be scripted — do it by hand once per this task.

- [ ] **Step 8: Commit**

```bash
git add "app/(auth)" app/auth components/auth
git commit -m "feat: add Antigravity-styled login and signup flows"
```

---

### Task 5: App shell — layout, FastingProvider, dashboard data fetch

**Files:**
- Create: `app/(app)/layout.tsx`
- Create: `components/fasting/FastingContext.tsx`
- Create: `components/layout/BottomNav.tsx`
- Create: `app/(app)/dashboard/page.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `createClient()` from `@/utils/supabase/server` (Task 1).
- Produces: `FastingProvider`, `useFasting()` from `@/components/fasting/FastingContext` — `{ isFasting: boolean; startTime: Date | null; targetDuration: number | null; activeFastId: string | null; startFast(targetHours: number, id: string, start: Date): void; stopFast(): void }`. `BottomNav` component. `DashboardPage` passes `profile: { full_name: string | null }` into `DashboardClient` (built in Task 6).

- [ ] **Step 1: Port the fasting context verbatim**

`components/fasting/FastingContext.tsx`:
```typescript
'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'

type FastingContextType = {
  isFasting: boolean
  startTime: Date | null
  targetDuration: number | null
  activeFastId?: string | null
  startFast: (targetHours: number, id: string, start: Date) => void
  stopFast: () => void
}

const FastingContext = createContext<FastingContextType | undefined>(undefined)

export function FastingProvider({ children, initialFast }: { children: React.ReactNode, initialFast?: { id: string, start_time: string, target_duration_hours: number } | null }) {
  const [activeFastId, setActiveFastId] = useState<string | null>(initialFast?.id || null)
  const [isFasting, setIsFasting] = useState(!!initialFast)
  const [startTime, setStartTime] = useState<Date | null>(initialFast ? new Date(initialFast.start_time) : null)
  const [targetDuration, setTargetDuration] = useState<number | null>(initialFast?.target_duration_hours || null)

  useEffect(() => {
    setIsFasting(!!initialFast)
    setActiveFastId(initialFast?.id || null)
    setStartTime(initialFast ? new Date(initialFast.start_time) : null)
    setTargetDuration(initialFast?.target_duration_hours || null)
  }, [initialFast])

  const startFast = (targetHours: number, id: string, start: Date) => {
    setIsFasting(true)
    setStartTime(start)
    setTargetDuration(targetHours)
    setActiveFastId(id)
    if (typeof window !== 'undefined' && 'Notification' in window) {
      Notification.requestPermission()
    }
  }

  const stopFast = () => {
    setIsFasting(false)
    setStartTime(null)
    setTargetDuration(null)
    setActiveFastId(null)
  }

  return (
    <FastingContext.Provider value={{ isFasting, startTime, targetDuration, activeFastId, startFast, stopFast }}>
      {children}
    </FastingContext.Provider>
  )
}

export function useFasting() {
  const context = useContext(FastingContext)
  if (!context) throw new Error('useFasting must be used within FastingProvider')
  return context
}
```

- [ ] **Step 2: Build the bottom nav with Home functional, Stats/Settings as stubs**

`components/layout/BottomNav.tsx`:
```typescript
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
```

- [ ] **Step 3: Build the authenticated layout**

`app/(app)/layout.tsx`:
```typescript
import { BottomNav } from "@/components/layout/BottomNav";
import { FastingProvider } from "@/components/fasting/FastingContext";
import { createClient } from "@/utils/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let initialFast = null;
  if (user) {
    const { data } = await supabase
      .from('fasting_logs')
      .select('id, start_time, target_duration_hours')
      .eq('user_id', user.id)
      .eq('status', 'ongoing')
      .single();
    initialFast = data;
  }

  return (
    <FastingProvider initialFast={initialFast}>
      <div className="flex flex-col min-h-[100dvh] flex-1 w-full bg-background pb-24">
        {children}
        <BottomNav />
      </div>
    </FastingProvider>
  );
}
```

- [ ] **Step 4: Build the dashboard server component (data fetch only — UI in Task 6)**

`app/(app)/dashboard/page.tsx`:
```typescript
import DashboardClient from './DashboardClient'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profileData } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const profile = profileData || {
    full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'there',
  }

  return <DashboardClient initialProfile={profile} />
}
```

- [ ] **Step 5: Point the root page at the dashboard**

`app/page.tsx`:
```typescript
import { redirect } from 'next/navigation'

export default function Home() {
  redirect('/dashboard')
}
```

- [ ] **Step 6: Verify the build compiles**

This task references `./DashboardClient`, which doesn't exist until Task 6. Create a temporary placeholder so the build can be verified, then delete it in Task 6's first step:

```bash
cd "/Users/justin/Desktop/1. Programming/NextJS/fastingv2"
cat > "app/(app)/dashboard/DashboardClient.tsx" << 'EOF'
export default function DashboardClient({ initialProfile }: { initialProfile: { full_name: string | null } }) {
  return <div className="p-container-margin">Hi, {initialProfile.full_name}</div>
}
EOF
pnpm build
```

Expected: build succeeds. Then manually verify: `pnpm dev`, log in (from Task 4's test account), confirm `/dashboard` renders "Hi, {your name}" inside the floating bottom nav shell with the Antigravity background color.

- [ ] **Step 7: Commit**

```bash
git add "app/(app)" components/fasting/FastingContext.tsx components/layout/BottomNav.tsx app/page.tsx
git commit -m "feat: add authenticated app shell with FastingProvider and bottom nav"
```

---

### Task 6: Fasting timer UI and server actions

**Files:**
- Modify: `app/(app)/dashboard/DashboardClient.tsx` (replace Task 5's placeholder)
- Create: `components/fasting/DurationSelector.tsx`
- Create: `components/fasting/ElapsedClock.tsx`
- Create: `components/ui/Modal.tsx`
- Create: `app/actions/fasting.ts`

**Interfaces:**
- Consumes: `useFasting()` from `@/components/fasting/FastingContext` (Task 5), `formatElapsed`/`getFastingStage`/`computeStopOutcome` from `@/lib/fasting` (Task 3), `createClient` cookie pattern for server actions.
- Produces: `startFastingLog(targetDurationHours: number): Promise<{ error: string } | { success: true; data: { id: string; start_time: string } }>`, `updateFastingLog(id: string, status: 'completed' | 'missed'): Promise<{ error: string } | { success: true }>`, `cancelFastingLog(id: string): Promise<{ error: string } | { success: true }>` from `@/app/actions/fasting`.

- [ ] **Step 1: Delete Task 5's placeholder**

```bash
cd "/Users/justin/Desktop/1. Programming/NextJS/fastingv2"
rm "app/(app)/dashboard/DashboardClient.tsx"
```

- [ ] **Step 2: Port the fasting server actions**

`app/actions/fasting.ts`:
```typescript
'use server'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'

async function getServerSupabase() {
  const cookieStore = await cookies()
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() { return cookieStore.getAll() },
      setAll(cookiesToSet) { try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {} }
    }
  })
}

export async function startFastingLog(targetDurationHours: number) {
  const supabase = await getServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  await supabase.from('fasting_logs').update({ status: 'missed', end_time: new Date().toISOString() }).eq('user_id', user.id).eq('status', 'ongoing')

  const { data, error } = await supabase.from('fasting_logs').insert({
    user_id: user.id,
    start_time: new Date().toISOString(),
    target_duration_hours: targetDurationHours,
    status: 'ongoing'
  }).select().single()

  if (error) return { error: error.message }
  revalidatePath('/dashboard', 'layout')
  return { success: true as const, data }
}

export async function updateFastingLog(id: string, status: 'completed' | 'missed') {
  const supabase = await getServerSupabase()
  const { error } = await supabase.from('fasting_logs').update({
    status,
    end_time: new Date().toISOString()
  }).eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/dashboard', 'layout')
  return { success: true as const }
}

export async function cancelFastingLog(id: string) {
  const supabase = await getServerSupabase()
  const { error } = await supabase.from('fasting_logs').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/dashboard', 'layout')
  return { success: true as const }
}
```

- [ ] **Step 3: Build the restyled duration selector**

`components/fasting/DurationSelector.tsx`:
```typescript
'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'

const PRESETS = [2, 4, 6, 8]

interface DurationSelectorProps {
  duration: number | null
  setDuration: (duration: number) => void
  disabled?: boolean
}

export function DurationSelector({ duration, setDuration, disabled }: DurationSelectorProps) {
  const [isCustom, setIsCustom] = React.useState(duration !== null && !PRESETS.includes(duration))

  return (
    <div className="flex items-center justify-center gap-stack-gap w-full overflow-x-auto pb-4">
      {PRESETS.map((preset) => (
        <button
          key={preset}
          disabled={disabled}
          onClick={() => {
            setDuration(preset)
            setIsCustom(false)
          }}
          className={cn(
            'shrink-0 w-16 h-16 rounded-2xl flex items-center justify-center shadow-float transition-colors duration-300 ease-glide font-body-md text-body-md font-medium disabled:opacity-50',
            duration === preset && !isCustom
              ? 'bg-primary-container/20 text-primary border border-primary-container/30'
              : 'bg-surface text-on-surface-variant hover:bg-surface-container-low'
          )}
        >
          {preset}H
        </button>
      ))}
      <button
        disabled={disabled}
        onClick={() => {
          setIsCustom(true)
          const hours = window.prompt('Custom fast duration, in hours (1–72):', duration ? String(duration) : '16')
          const parsed = hours ? Number(hours) : NaN
          if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= 72) {
            setDuration(parsed)
          }
        }}
        className={cn(
          'shrink-0 px-4 h-16 rounded-2xl flex items-center justify-center gap-2 shadow-float transition-colors duration-300 ease-glide font-body-md text-body-md font-medium disabled:opacity-50',
          isCustom
            ? 'bg-primary-container/20 text-primary border border-primary-container/30'
            : 'bg-surface text-on-surface-variant hover:bg-surface-container-low'
        )}
      >
        <SlidersHorizontal size={18} />
        {isCustom && duration ? `${duration}H` : 'Custom'}
      </button>
    </div>
  )
}
```

(Note: the Custom control uses `window.prompt` for this MVP rather than a full modal-based numeric picker — it is fully functional and keeps this task's scope to the timer's core loop. Swapping in a nicer in-app picker is a natural, low-risk follow-up and does not change the `DurationSelector` props/interface.)

- [ ] **Step 4: Build the elapsed-time centerpiece clock**

`components/fasting/ElapsedClock.tsx`:
```typescript
'use client'

import * as React from 'react'
import { differenceInSeconds } from 'date-fns'
import { Flame } from 'lucide-react'
import { formatElapsed, getFastingStage } from '@/lib/fasting'

interface ElapsedClockProps {
  isFasting: boolean
  startTime: Date | null
}

export function ElapsedClock({ isFasting, startTime }: ElapsedClockProps) {
  const [elapsedSeconds, setElapsedSeconds] = React.useState(0)

  React.useEffect(() => {
    if (!isFasting || !startTime) {
      setElapsedSeconds(0)
      return
    }
    const tick = () => setElapsedSeconds(differenceInSeconds(new Date(), startTime))
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [isFasting, startTime])

  const stage = getFastingStage(elapsedSeconds / 3600)

  return (
    <div className="relative w-full aspect-square max-w-[320px] rounded-full flex flex-col items-center justify-center shadow-float bg-surface/50 backdrop-blur-md animate-float">
      <div className="absolute inset-0 rounded-full border border-surface-tint/5 pointer-events-none" />
      <div className="font-label-caps text-label-caps text-on-surface-variant mb-2 opacity-70">
        {isFasting ? 'CURRENT FAST' : 'READY TO FAST'}
      </div>
      <div className="font-display-clock text-display-clock text-primary tracking-tighter leading-none mb-1">
        {formatElapsed(elapsedSeconds)}
      </div>
      {isFasting && (
        <div className="flex items-center gap-2 mt-4 bg-secondary-container/30 px-4 py-1.5 rounded-full">
          <Flame size={16} className="text-secondary" />
          <span className="font-label-caps text-label-caps text-secondary">
            {stage === 'fat_burning' ? 'FAT BURNING' : 'FASTING'}
          </span>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Port the confirmation modal, restyled**

`components/ui/Modal.tsx`:
```typescript
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
```

- [ ] **Step 6: Compose the dashboard client**

`app/(app)/dashboard/DashboardClient.tsx`:
```typescript
'use client'

import * as React from 'react'
import { Bell, Play, Square } from 'lucide-react'
import { useFasting } from '@/components/fasting/FastingContext'
import { DurationSelector } from '@/components/fasting/DurationSelector'
import { ElapsedClock } from '@/components/fasting/ElapsedClock'
import { Modal } from '@/components/ui/Modal'
import { startFastingLog, updateFastingLog, cancelFastingLog } from '@/app/actions/fasting'
import { computeStopOutcome } from '@/lib/fasting'

interface DashboardClientProps {
  initialProfile: { full_name: string | null }
}

export default function DashboardClient({ initialProfile }: DashboardClientProps) {
  const { isFasting, startTime, targetDuration, activeFastId, startFast, stopFast } = useFasting()
  const [duration, setDuration] = React.useState<number | null>(targetDuration)
  const [showConfirm, setShowConfirm] = React.useState(false)
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  const firstName = initialProfile.full_name?.split(' ')[0] || 'there'

  const handleConfirm = async () => {
    setIsSubmitting(true)
    if (isFasting && startTime && targetDuration && activeFastId) {
      const outcome = computeStopOutcome(startTime, targetDuration, new Date())
      if (outcome.action === 'discard') {
        await cancelFastingLog(activeFastId)
      } else {
        await updateFastingLog(activeFastId, outcome.status)
      }
      stopFast()
    } else if (duration) {
      const result = await startFastingLog(duration)
      if ('data' in result && result.data) {
        startFast(duration, result.data.id, new Date(result.data.start_time))
      }
    }
    setIsSubmitting(false)
    setShowConfirm(false)
  }

  return (
    <div className="flex flex-col flex-1">
      <header className="flex justify-between items-center px-container-margin py-4">
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-primary tracking-tighter">
          Hi, {firstName}
        </h1>
        <div className="w-10 h-10 rounded-full flex items-center justify-center text-on-surface-variant bg-surface-container-low shadow-float">
          <Bell size={18} />
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-container-margin py-section-padding gap-section-padding">
        <ElapsedClock isFasting={isFasting} startTime={startTime} />

        {!isFasting && (
          <DurationSelector duration={duration} setDuration={setDuration} />
        )}

        <button
          onClick={() => setShowConfirm(true)}
          disabled={!isFasting && !duration}
          className="w-24 h-24 rounded-full bg-primary-container text-on-primary-container flex flex-col items-center justify-center shadow-float animate-pulse-glow hover:scale-105 active:scale-95 transition-transform duration-300 ease-glide disabled:opacity-50 disabled:animate-none"
        >
          {isFasting ? <Square size={20} /> : <Play size={20} />}
          <span className="font-label-caps text-label-caps mt-1">{isFasting ? 'STOP' : 'START'}</span>
        </button>
      </main>

      <Modal isOpen={showConfirm} onClose={() => setShowConfirm(false)} title={isFasting ? 'Stop Fasting' : 'Start Fasting'}>
        <p className="font-body-md text-body-md text-on-surface mb-6">
          Are you sure you want to {isFasting ? 'stop your current fast' : `start a ${duration}h fast`}?
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => setShowConfirm(false)}
            disabled={isSubmitting}
            className="flex-1 py-3 rounded-full font-label-caps text-label-caps bg-surface-container-low text-on-surface hover:bg-surface-container transition-colors"
          >
            CANCEL
          </button>
          <button
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="flex-1 py-3 rounded-full font-label-caps text-label-caps bg-primary-container text-on-primary-container hover:shadow-float-hover transition-shadow disabled:opacity-50"
          >
            {isSubmitting ? 'SAVING...' : isFasting ? 'YES, STOP' : 'YES, START'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
```

- [ ] **Step 7: Verify end-to-end manually**

```bash
cd "/Users/justin/Desktop/1. Programming/NextJS/fastingv2"
pnpm build
pnpm dev
```

In a browser, log in with the account from Task 4. Confirm:
1. The dashboard shows "Hi, {name}", the elapsed clock centerpiece reading `00:00`, "READY TO FAST", and the four preset buttons + Custom.
2. Selecting a preset (e.g. 2H) and tapping the pulsing START button opens the confirm modal; confirming starts the fast — the clock begins ticking, the label switches to "CURRENT FAST", and the button switches to STOP.
3. Reload the page — the fast is still running (state came from the DB via `app/(app)/layout.tsx`, not just client memory).
4. Tap STOP, confirm — the fast ends, the clock resets to `00:00`/"READY TO FAST".
5. In the Supabase table editor (or via `psql`/Supabase CLI) confirm the `fasting_logs` row has the correct `status` and `end_time`.
6. Start a fast, stop it within a few seconds — confirm the row is deleted (not saved), matching the discard-under-5-minutes rule.

This is a real Supabase round-trip and must be checked by hand — there is no automated E2E coverage in this phase (documented gap, see spec).

- [ ] **Step 8: Commit**

```bash
git add "app/(app)/dashboard/DashboardClient.tsx" components/fasting/DurationSelector.tsx components/fasting/ElapsedClock.tsx components/ui/Modal.tsx app/actions/fasting.ts
git commit -m "feat: add fasting timer UI wired to Supabase server actions"
```

---

### Task 7: PWA manifest and final verification pass

**Files:**
- Create: `public/manifest.json`
- Modify: none (verification only)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new — this task closes out the MVP.

- [ ] **Step 1: Add the Antigravity-themed manifest**

`public/manifest.json`:
```json
{
  "name": "Antigravity",
  "short_name": "Antigravity",
  "description": "A weightless, mindful intermittent fasting tracker",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#F6F4F0",
  "theme_color": "#FFB84C",
  "icons": [
    {
      "src": "/icon-192x192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icon-512x512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

Note: the referenced icon files don't exist yet — this matches v1's current state (same gap there) and is out of scope for this phase per the spec's non-goals (PWA install polish).

- [ ] **Step 2: Run the full verification suite**

```bash
cd "/Users/justin/Desktop/1. Programming/NextJS/fastingv2"
pnpm lint
pnpm test
pnpm build
```

Expected: all three succeed with no errors. `pnpm lint` may warn about the `img`/`<a>` patterns inherited from Next's ESLint config — fix any that are errors, warnings are acceptable to leave for this phase.

- [ ] **Step 3: Manual smoke test checklist**

Run through this list once with `pnpm dev` and record the result (pass/fail) for each — this is the MVP's acceptance gate:
- [ ] Sign up with a new email → redirected to "check your email" state
- [ ] Verify email via the link → redirected to dashboard
- [ ] Log out (via browser: clear cookies, or navigate directly and let a fresh incognito session hit `/login`) and log back in with the same credentials
- [ ] Dashboard greets by first name
- [ ] Start a fast with a preset duration → live clock ticks, status chip shows
- [ ] Stop a fast after the 12-hour "fat burning" stage triggers (or verify via the unit test coverage from Task 3 instead of waiting 12 real hours) → chip updates correctly
- [ ] Stop a fast early → saved as `missed` in Supabase
- [ ] Stop a fast at/after target duration → saved as `completed` in Supabase
- [ ] Cancel a fast within 5 minutes → row is deleted, not saved
- [ ] Reload mid-fast → timer state persists (comes from DB)
- [ ] Toggle system dark mode → app follows without a flash of unstyled/wrong-theme content
- [ ] Bottom nav shows Stats/Settings as visibly disabled, does not navigate or error when tapped

- [ ] **Step 4: Commit**

```bash
git add public/manifest.json
git commit -m "feat: add PWA manifest for Antigravity"
```

---

## Self-Review Notes

- **Spec coverage:** Auth/onboarding (Task 4), fasting timer core loop incl. presets/custom/start/stop (Task 6), design system tokens/dark mode (Task 2), data model reuse — no new migrations (confirmed against v1's existing `profiles`/`fasting_logs` schema, Task 1/5/6), nav shell with dimmed stubs (Task 5), error handling inline not `alert()` (Tasks 4/6), Vitest for pure logic only (Task 3). All spec sections are covered.
- **Deviation from spec called out explicitly:** the spec's "completed/partial/missed" status language is corrected in this plan to match v1's actual, proven logic — a discard-under-threshold action plus `completed`/`missed` (the `partial` enum value exists in the DB check constraint but was never actually set by v1's code, so this plan doesn't invent new logic to produce it).
- **Type consistency:** `FastingContext`'s `startFast(targetHours, id, start)` signature is used identically in Task 6's `DashboardClient`. `computeStopOutcome`'s return shape (`{ action: 'discard' }` vs `{ action: 'save'; status }`) is defined once in Task 3 and consumed exactly that way in Task 6. `startFastingLog`/`updateFastingLog`/`cancelFastingLog` signatures match between Task 6's server action file and its DashboardClient caller.
