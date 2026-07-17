# Eating Window Auto-Stop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users opt into a full fasting/eating cycle where both the fast and the eating window auto-complete at their configured target duration, with a server-side cron backstop so history stays accurate even if the app isn't open.

**Architecture:** Add a `phase` column to `fasting_logs` (`'fasting' | 'eating'`) and two new `profiles` columns (`eating_window_enabled`, `eating_window_hours`). The existing per-second client tick in `FastingClock` detects target-reached and auto-completes via the existing `updateFastingLog` action (with a pinned `end_time`); the existing notifications cron gets a parallel force-close path for the same case, as a backstop. No new tables, no new cron schedule.

**Tech Stack:** Next.js App Router, Supabase (Postgres via MCP tools, no local migration files), Vitest, TypeScript, Tailwind.

## Global Constraints

- No local migration files exist in this repo — schema changes are applied directly via the Supabase MCP `apply_migration` tool.
- `end_time` on auto-completion (client or cron) must always be pinned to `start_time + target_duration_hours`, never `now` — this is the core correctness requirement from the spec.
- Feature is opt-in via `profiles.eating_window_enabled` (default `false`); existing single-fast behavior must be unchanged when it's off.
- Eating window duration (`eating_window_hours`) is configured independently of fasting duration — not derived.
- After either phase auto-completes, the next phase is always manually started by the user — no auto-chaining.
- Run `npm test` (vitest) after every task that touches `lib/`.

---

### Task 1: Schema — add `phase` to `fasting_logs`, add eating-window columns to `profiles`

**Files:**
- No local file — apply via Supabase MCP `apply_migration`.

**Interfaces:**
- Produces: `fasting_logs.phase` (`text`, `not null`, `default 'fasting'`, check constraint `in ('fasting','eating')`); `profiles.eating_window_enabled` (`boolean`, `not null`, `default false`); `profiles.eating_window_hours` (`numeric`, `not null`, `default 8`).

- [ ] **Step 1: Apply the migration**

Use the `mcp__plugin_supabase_supabase__apply_migration` tool with:

```sql
alter table fasting_logs
  add column phase text not null default 'fasting'
  constraint fasting_logs_phase_check check (phase in ('fasting', 'eating'));

alter table profiles
  add column eating_window_enabled boolean not null default false,
  add column eating_window_hours numeric not null default 8;
```

Migration name: `add_eating_window_phase_and_settings`

- [ ] **Step 2: Verify with `list_tables`**

Use `mcp__plugin_supabase_supabase__list_tables` and confirm `fasting_logs` has `phase` and `profiles` has `eating_window_enabled`, `eating_window_hours` with the expected types/defaults.

- [ ] **Step 3: Commit**

No files changed in this repo for this task (schema-only) — nothing to commit. Proceed to Task 2.

---

### Task 2: `lib/fasting.ts` — filter streak/completion-rate to fasting-phase rows only

**Files:**
- Modify: `lib/fasting.ts:48-80`
- Test: `lib/fasting.test.ts`

**Interfaces:**
- Consumes: none new.
- Produces: `StreakLog` gains optional `phase?: 'fasting' | 'eating'`. `getCurrentStreak` and `getCompletionRate` ignore rows where `phase === 'eating'`. Rows without a `phase` field (older callers/tests) are treated as `'fasting'` for back-compat.

- [ ] **Step 1: Write the failing tests**

Add to `lib/fasting.test.ts`, inside the existing `describe('getCurrentStreak', ...)` block:

```ts
  it('ignores eating-window rows when counting the streak', () => {
    const now = new Date('2026-07-14T20:00:00.000Z')
    const logs = [
      { start_time: '2026-07-14T16:00:00.000Z', status: 'completed' as const, phase: 'eating' as const },
      { start_time: '2026-07-14T08:00:00.000Z', status: 'completed' as const, phase: 'fasting' as const },
      { start_time: '2026-07-13T08:00:00.000Z', status: 'completed' as const, phase: 'fasting' as const },
    ]
    expect(getCurrentStreak(logs, now)).toBe(2)
  })
```

And inside `describe('getCompletionRate', ...)`:

```ts
  it('ignores eating-window rows when computing completion rate', () => {
    const logs = [
      { start_time: '2026-07-15T08:00:00.000Z', status: 'completed' as const, phase: 'fasting' as const },
      { start_time: '2026-07-15T16:00:00.000Z', status: 'missed' as const, phase: 'eating' as const },
      { start_time: '2026-07-14T08:00:00.000Z', status: 'missed' as const, phase: 'fasting' as const },
    ]
    expect(getCompletionRate(logs, now)).toBe(50)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- lib/fasting.test.ts`
Expected: FAIL — both new tests fail because `phase` is currently ignored (eating rows counted as fasting rows), giving wrong streak/rate numbers (3 not 2, and a different percentage than 50).

- [ ] **Step 3: Implement the filter**

In `lib/fasting.ts`, update the `StreakLog` interface and both functions:

```ts
export interface StreakLog {
  start_time: string
  status: 'completed' | 'missed' | 'partial'
  phase?: 'fasting' | 'eating'
}

export function getCurrentStreak(logs: StreakLog[], now: Date): number {
  const fastingLogs = logs.filter((log) => (log.phase ?? 'fasting') === 'fasting')
  const sorted = [...fastingLogs].sort(
    (a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime()
  )

  if (sorted.length === 0) return 0

  if (differenceInCalendarDays(now, new Date(sorted[0].start_time)) > 1) {
    return 0
  }

  let streak = 0
  for (const log of sorted) {
    if (log.status !== 'completed') break
    streak++
  }
  return streak
}

export function getCompletionRate(logs: StreakLog[], now: Date, windowDays = 30): number {
  const fastingLogs = logs.filter((log) => (log.phase ?? 'fasting') === 'fasting')
  const cutoff = now.getTime() - windowDays * 24 * 60 * 60 * 1000
  const inWindow = fastingLogs.filter((log) => new Date(log.start_time).getTime() >= cutoff)

  if (inWindow.length === 0) return 0

  const completed = inWindow.filter((log) => log.status === 'completed').length
  return Math.round((completed / inWindow.length) * 100)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- lib/fasting.test.ts`
Expected: PASS, all tests including previous ones.

- [ ] **Step 5: Commit**

```bash
git add lib/fasting.ts lib/fasting.test.ts
git commit -m "feat: exclude eating-window rows from streak and completion-rate calculations"
```

---

### Task 3: `lib/notifications.ts` — add `getOverdueOngoingLogs` for the cron backstop

**Files:**
- Modify: `lib/notifications.ts`
- Test: `lib/notifications.test.ts`

**Interfaces:**
- Consumes: none new.
- Produces: `OngoingLog { id: string; startTime: string; targetDurationHours: number }` and `getOverdueOngoingLogs(logs: OngoingLog[], now: Date): OngoingLog[]` — returns the subset where `now >= startTime + targetDurationHours` (in hours). Used by Task 5's cron route to force-complete overdue rows regardless of phase.

- [ ] **Step 1: Write the failing tests**

Add to `lib/notifications.test.ts`:

```ts
import { getOverdueOngoingLogs } from './notifications'

describe('getOverdueOngoingLogs', () => {
  it('excludes a log that has not yet reached its target', () => {
    const now = new Date('2026-07-15T14:00:00.000Z') // 6h into an 8h target
    const logs = [{ id: '1', startTime: '2026-07-15T08:00:00.000Z', targetDurationHours: 8 }]
    expect(getOverdueOngoingLogs(logs, now)).toEqual([])
  })

  it('includes a log exactly at its target', () => {
    const now = new Date('2026-07-15T16:00:00.000Z') // exactly 8h
    const logs = [{ id: '1', startTime: '2026-07-15T08:00:00.000Z', targetDurationHours: 8 }]
    expect(getOverdueOngoingLogs(logs, now)).toEqual(logs)
  })

  it('includes a log past its target', () => {
    const now = new Date('2026-07-15T20:00:00.000Z') // 12h into an 8h target
    const logs = [{ id: '1', startTime: '2026-07-15T08:00:00.000Z', targetDurationHours: 8 }]
    expect(getOverdueOngoingLogs(logs, now)).toEqual(logs)
  })

  it('filters a mixed list to only the overdue ones', () => {
    const now = new Date('2026-07-15T16:00:00.000Z')
    const logs = [
      { id: 'overdue', startTime: '2026-07-15T08:00:00.000Z', targetDurationHours: 8 },
      { id: 'not-yet', startTime: '2026-07-15T12:00:00.000Z', targetDurationHours: 8 },
    ]
    expect(getOverdueOngoingLogs(logs, now)).toEqual([logs[0]])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- lib/notifications.test.ts`
Expected: FAIL with "getOverdueOngoingLogs is not a function" / import error.

- [ ] **Step 3: Implement**

Add to `lib/notifications.ts`:

```ts
export interface OngoingLog {
  id: string
  startTime: string
  targetDurationHours: number
}

export function getOverdueOngoingLogs(logs: OngoingLog[], now: Date): OngoingLog[] {
  return logs.filter((log) => {
    const targetMs = new Date(log.startTime).getTime() + log.targetDurationHours * 3600_000
    return now.getTime() >= targetMs
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- lib/notifications.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add lib/notifications.ts lib/notifications.test.ts
git commit -m "feat: add getOverdueOngoingLogs for eating-window cron backstop"
```

---

### Task 4: `app/actions/fasting.ts` — support `phase` in start/update, pin `end_time` on auto-complete

**Files:**
- Modify: `app/actions/fasting.ts`

**Interfaces:**
- Consumes: none new (Supabase client as before).
- Produces: `startFastingLog(targetDurationHours: number, phase: 'fasting' | 'eating' = 'fasting')` — inserts with the given phase. `completeFastingLogAtTarget(id: string, startTime: string, targetDurationHours: number)` — new action that sets `status: 'completed'` and pins `end_time` to `startTime + targetDurationHours` (used by the client auto-complete path in Task 6; distinct from the existing `updateFastingLog`, which stamps `end_time: now` for manual user-initiated stops and must stay unchanged for that path).

- [ ] **Step 1: Implement — no test file for this action (server actions in this codebase have no existing test coverage pattern; covered by Task 2/3 pure-function tests plus manual verification in Task 8)**

Modify `app/actions/fasting.ts`:

```ts
export async function startFastingLog(targetDurationHours: number, phase: 'fasting' | 'eating' = 'fasting') {
  const supabase = await getServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  await supabase.from('fasting_logs').update({ status: 'missed', end_time: new Date().toISOString() }).eq('user_id', user.id).eq('status', 'ongoing')

  const { data, error } = await supabase.from('fasting_logs').insert({
    user_id: user.id,
    start_time: new Date().toISOString(),
    target_duration_hours: targetDurationHours,
    phase,
    status: 'ongoing'
  }).select().single()

  if (error) return { error: error.message }
  revalidatePath('/dashboard', 'layout')
  return { success: true as const, data }
}

export async function completeFastingLogAtTarget(id: string, startTime: string, targetDurationHours: number) {
  const supabase = await getServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const endTime = new Date(new Date(startTime).getTime() + targetDurationHours * 3600_000).toISOString()

  const { error } = await supabase.from('fasting_logs').update({
    status: 'completed',
    end_time: endTime
  }).eq('id', id).eq('user_id', user.id).eq('status', 'ongoing')

  if (error) return { error: error.message }
  revalidatePath('/dashboard', 'layout')
  return { success: true as const }
}
```

Leave `updateFastingLog` and `cancelFastingLog` unchanged.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/actions/fasting.ts
git commit -m "feat: add phase param to startFastingLog and completeFastingLogAtTarget action"
```

---

### Task 5: Cron route — force-close overdue ongoing logs for eating-window users

**Files:**
- Modify: `app/api/cron/notifications/route.ts`

**Interfaces:**
- Consumes: `getOverdueOngoingLogs` from Task 3 (`lib/notifications.ts`).
- Produces: no new exports — this is the route handler itself.

- [ ] **Step 1: Implement**

In `app/api/cron/notifications/route.ts`, add the import and a new loop. Insert after the existing `import` block:

```ts
import { getOverdueOngoingLogs } from '@/lib/notifications'
```

Inside the `for (const profile of profiles ?? [])` loop, this loop currently only runs for `notifications_enabled = true` profiles (line 23-26 query filter). The eating-window backstop must run independently of `notifications_enabled`, so add a **separate top-level query and loop** after the existing one (i.e., after the closing `}` of the `for (const profile of profiles ?? [])` block, before `return NextResponse.json({ success: true })`):

```ts
  const { data: eatingWindowProfiles } = await supabase
    .from('profiles')
    .select('id')
    .eq('eating_window_enabled', true)

  for (const profile of eatingWindowProfiles ?? []) {
    const { data: ongoing } = await supabase
      .from('fasting_logs')
      .select('id, start_time, target_duration_hours')
      .eq('user_id', profile.id)
      .eq('status', 'ongoing')

    const overdue = getOverdueOngoingLogs(
      (ongoing ?? []).map((log) => ({
        id: log.id,
        startTime: log.start_time,
        targetDurationHours: log.target_duration_hours,
      })),
      now
    )

    for (const log of overdue) {
      const endTime = new Date(
        new Date(log.startTime).getTime() + log.targetDurationHours * 3600_000
      ).toISOString()
      await supabase
        .from('fasting_logs')
        .update({ status: 'completed', end_time: endTime })
        .eq('id', log.id)
        .eq('status', 'ongoing')
    }
  }
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/cron/notifications/route.ts
git commit -m "feat: force-complete overdue ongoing fasts/eating-windows in cron backstop"
```

---

### Task 6: `FastingClock` and `FastingContext` — phase-aware display and target-reached callback

**Files:**
- Modify: `components/fasting/FastingClock.tsx`
- Modify: `components/fasting/FastingContext.tsx`

**Interfaces:**
- Consumes: none new.
- Produces: `FastingClock` gains props `phase: 'fasting' | 'eating' | null` (default display unaffected when `null`) and `onTargetReached?: () => void` (fires once, on the tick where `remainingSeconds` first crosses to `<= 0`). `FastingContext` gains `phase: 'fasting' | 'eating' | null` state, threaded through `startFast(targetHours, id, start, phase)` and reset in `stopFast`, and re-synced from `initialFast.phase` the same way `targetDuration` already is.

- [ ] **Step 1: Update `FastingContext.tsx`**

```tsx
'use client'

import React, { createContext, useContext, useState } from 'react'

type Phase = 'fasting' | 'eating'

type FastingContextType = {
  isFasting: boolean
  startTime: Date | null
  targetDuration: number | null
  activeFastId?: string | null
  phase: Phase | null
  startFast: (targetHours: number, id: string, start: Date, phase: Phase) => void
  stopFast: () => void
}

const FastingContext = createContext<FastingContextType | undefined>(undefined)

export function FastingProvider({ children, initialFast }: { children: React.ReactNode, initialFast?: { id: string, start_time: string, target_duration_hours: number, phase?: Phase } | null }) {
  const [activeFastId, setActiveFastId] = useState<string | null>(initialFast?.id || null)
  const [isFasting, setIsFasting] = useState(!!initialFast)
  const [startTime, setStartTime] = useState<Date | null>(initialFast ? new Date(initialFast.start_time) : null)
  const [targetDuration, setTargetDuration] = useState<number | null>(initialFast?.target_duration_hours || null)
  const [phase, setPhase] = useState<Phase | null>(initialFast?.phase ?? (initialFast ? 'fasting' : null))
  const [prevInitialFast, setPrevInitialFast] = useState(initialFast)

  if (initialFast !== prevInitialFast) {
    setPrevInitialFast(initialFast)
    setIsFasting(!!initialFast)
    setActiveFastId(initialFast?.id || null)
    setStartTime(initialFast ? new Date(initialFast.start_time) : null)
    setTargetDuration(initialFast?.target_duration_hours || null)
    setPhase(initialFast?.phase ?? (initialFast ? 'fasting' : null))
  }

  const startFast = (targetHours: number, id: string, start: Date, startPhase: Phase) => {
    setIsFasting(true)
    setStartTime(start)
    setTargetDuration(targetHours)
    setActiveFastId(id)
    setPhase(startPhase)
  }

  const stopFast = () => {
    setIsFasting(false)
    setStartTime(null)
    setTargetDuration(null)
    setActiveFastId(null)
    setPhase(null)
  }

  return (
    <FastingContext.Provider value={{ isFasting, startTime, targetDuration, activeFastId, phase, startFast, stopFast }}>
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

- [ ] **Step 2: Update `FastingClock.tsx`**

Replace the full file:

```tsx
'use client'

import * as React from 'react'
import { differenceInSeconds } from 'date-fns'
import { motion } from 'framer-motion'
import { Flame } from 'lucide-react'
import { formatElapsed, getFastingStage, getRemainingSeconds, getProgressFraction } from '@/lib/fasting'

interface FastingClockProps {
  isFasting: boolean
  startTime: Date | null
  targetDuration: number | null
  phase?: 'fasting' | 'eating' | null
  onTargetReached?: () => void
}

const RING_RADIUS = 150
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

export function FastingClock({ isFasting, startTime, targetDuration, phase = null, onTargetReached }: FastingClockProps) {
  const [elapsedSeconds, setElapsedSeconds] = React.useState(0)
  const hasFiredTargetReached = React.useRef(false)

  React.useEffect(() => {
    hasFiredTargetReached.current = false
  }, [startTime])

  React.useEffect(() => {
    if (!isFasting || !startTime) return
    const tick = () => setElapsedSeconds(differenceInSeconds(new Date(), startTime))
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [isFasting, startTime])

  const displaySeconds = isFasting && startTime ? elapsedSeconds : 0
  const stage = getFastingStage(displaySeconds / 3600)

  const remainingSeconds = isFasting && targetDuration
    ? getRemainingSeconds(targetDuration, displaySeconds)
    : null

  React.useEffect(() => {
    if (
      onTargetReached &&
      remainingSeconds !== null &&
      remainingSeconds <= 0 &&
      !hasFiredTargetReached.current
    ) {
      hasFiredTargetReached.current = true
      onTargetReached()
    }
  }, [remainingSeconds, onTargetReached])

  // With onTargetReached wired up, the caller stops the fast/window at target,
  // so overtime never renders in practice — this guards the display only.
  const isOvertime = remainingSeconds !== null && remainingSeconds < 0
  const clockText = remainingSeconds === null
    ? formatElapsed(displaySeconds)
    : isOvertime
      ? `+${formatElapsed(-remainingSeconds)}`
      : formatElapsed(remainingSeconds)

  const progress = isFasting && targetDuration ? getProgressFraction(targetDuration, displaySeconds) : 0
  const isEating = phase === 'eating'

  return (
    <div className="relative w-full aspect-square max-w-[320px] rounded-full flex flex-col items-center justify-center shadow-float bg-surface/50 backdrop-blur-md animate-float">
      <div className="absolute inset-0 rounded-full border border-surface-tint/5 pointer-events-none" />
      <svg viewBox="0 0 320 320" className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none">
        <circle
          cx="160"
          cy="160"
          r={RING_RADIUS}
          fill="none"
          strokeWidth={6}
          className="stroke-surface-container-highest"
        />
        <motion.circle
          cx="160"
          cy="160"
          r={RING_RADIUS}
          fill="none"
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          animate={{ strokeDashoffset: RING_CIRCUMFERENCE * (1 - progress) }}
          transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
          className={isEating ? 'stroke-tertiary' : isOvertime ? 'stroke-secondary' : 'stroke-primary'}
        />
      </svg>
      <div className="font-label-caps text-label-caps text-on-surface-variant mb-2 opacity-70">
        {isFasting ? (isEating ? 'EATING WINDOW' : 'CURRENT FAST') : 'READY TO FAST'}
      </div>
      <div
        className={`font-display-clock text-display-clock tracking-tighter leading-none mb-1 tabular-nums ${
          isEating ? 'text-tertiary' : isOvertime ? 'text-secondary' : 'text-primary'
        }`}
      >
        {clockText}
      </div>
      {isFasting && !isEating && (
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

`text-tertiary` / `stroke-tertiary` use the `--color-tertiary` design token already defined in `app/globals.css:39` (light) and `:94` (dark) — no new token needed, this Tailwind class already resolves via the existing `--color-*` → utility mapping used by `primary`/`secondary` elsewhere in this file.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add components/fasting/FastingClock.tsx components/fasting/FastingContext.tsx
git commit -m "feat: add phase-aware display and onTargetReached to FastingClock"
```

---

### Task 7: Dashboard — wire auto-complete, manual next-phase CTA, phase-aware confirm copy

**Files:**
- Modify: `app/(app)/dashboard/DashboardClient.tsx`
- Modify: `app/(app)/dashboard/page.tsx`
- Modify: `app/(app)/layout.tsx`

**Interfaces:**
- Consumes: `completeFastingLogAtTarget` (Task 4), `FastingClock`'s `phase`/`onTargetReached` props (Task 6), `FastingContext`'s `phase` state and updated `startFast` signature (Task 6).
- Produces: dashboard renders "Start Eating Window" / "Start Fast" CTA after a phase auto-completes.

- [ ] **Step 1: Update `app/(app)/layout.tsx` to select and pass `phase`**

```tsx
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
      .select('id, start_time, target_duration_hours, phase')
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

- [ ] **Step 2: Update `app/(app)/dashboard/page.tsx` to fetch eating-window settings**

```tsx
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

(No change needed beyond confirming `select('*')` already includes the two new profile columns from Task 1 — it does, since it's `select('*')`.)

- [ ] **Step 3: Update `DashboardClient.tsx`**

Replace the full file:

```tsx
'use client'

import * as React from 'react'
import { Bell, BellOff, Play, Square } from 'lucide-react'
import { useFasting } from '@/components/fasting/FastingContext'
import { DurationSelector } from '@/components/fasting/DurationSelector'
import { FastingClock } from '@/components/fasting/FastingClock'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { startFastingLog, updateFastingLog, cancelFastingLog, completeFastingLogAtTarget } from '@/app/actions/fasting'
import { computeStopOutcome, formatTargetDuration } from '@/lib/fasting'

interface DashboardClientProps {
  initialProfile: {
    full_name: string | null
    min_fasting_threshold_minutes?: number | null
    eating_window_enabled?: boolean | null
    eating_window_hours?: number | null
  }
}

export default function DashboardClient({ initialProfile }: DashboardClientProps) {
  const { isFasting, startTime, targetDuration, activeFastId, phase, startFast, stopFast } = useFasting()
  const [duration, setDuration] = React.useState<number | null>(targetDuration)
  const [showConfirm, setShowConfirm] = React.useState(false)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [confirmError, setConfirmError] = React.useState<string | null>(null)
  const [showNotifications, setShowNotifications] = React.useState(false)
  // Tracks the phase that just auto-completed, so the dashboard can offer a
  // manual "start the next phase" CTA instead of the normal start/stop button.
  const [justCompletedPhase, setJustCompletedPhase] = React.useState<'fasting' | 'eating' | null>(null)

  const firstName = initialProfile.full_name?.split(' ')[0] || 'there'
  const thresholdMinutes = initialProfile.min_fasting_threshold_minutes ?? 5
  const eatingWindowEnabled = initialProfile.eating_window_enabled ?? false
  const eatingWindowHours = initialProfile.eating_window_hours ?? 8

  const openConfirm = () => {
    setConfirmError(null)
    setShowConfirm(true)
  }

  const closeConfirm = () => {
    setConfirmError(null)
    setShowConfirm(false)
  }

  const handleConfirm = async () => {
    setIsSubmitting(true)
    setConfirmError(null)
    if (isFasting && startTime && targetDuration && activeFastId) {
      const outcome = computeStopOutcome(startTime, targetDuration, new Date(), thresholdMinutes)
      const result = outcome.action === 'discard'
        ? await cancelFastingLog(activeFastId)
        : await updateFastingLog(activeFastId, outcome.status)
      if (!result.success) {
        setConfirmError(result.error)
        setIsSubmitting(false)
        return
      }
      stopFast()
    } else if (duration) {
      const result = await startFastingLog(duration, 'fasting')
      if (!result.success) {
        setConfirmError(result.error)
        setIsSubmitting(false)
        return
      }
      setJustCompletedPhase(null)
      startFast(duration, result.data.id, new Date(result.data.start_time), 'fasting')
    }
    setIsSubmitting(false)
    setShowConfirm(false)
  }

  const handleTargetReached = React.useCallback(async () => {
    if (!activeFastId || !startTime || !targetDuration) return
    await completeFastingLogAtTarget(activeFastId, startTime.toISOString(), targetDuration)
    setJustCompletedPhase(phase)
    stopFast()
  }, [activeFastId, startTime, targetDuration, phase, stopFast])

  const handleStartNextPhase = async () => {
    const nextPhase = justCompletedPhase === 'fasting' ? 'eating' : 'fasting'
    const nextDuration = nextPhase === 'eating' ? eatingWindowHours : (duration ?? 16)
    setIsSubmitting(true)
    const result = await startFastingLog(nextDuration, nextPhase)
    setIsSubmitting(false)
    if (!result.success) {
      setConfirmError(result.error)
      return
    }
    setJustCompletedPhase(null)
    startFast(nextDuration, result.data.id, new Date(result.data.start_time), nextPhase)
  }

  const showNextPhaseCta = eatingWindowEnabled && !isFasting && justCompletedPhase !== null

  return (
    <div className="flex flex-col flex-1">
      <header className="flex justify-between items-center px-container-margin py-4">
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-primary tracking-tighter">
          Hi, {firstName}
        </h1>
        <button
          type="button"
          onClick={() => setShowNotifications(true)}
          className="w-10 h-10 rounded-full flex items-center justify-center text-on-surface-variant bg-surface-container-low shadow-float hover:bg-surface-container transition-colors"
        >
          <Bell size={18} />
        </button>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-container-margin py-section-padding gap-section-padding">
        <FastingClock
          isFasting={isFasting}
          startTime={startTime}
          targetDuration={targetDuration}
          phase={phase}
          onTargetReached={eatingWindowEnabled ? handleTargetReached : undefined}
        />

        {!isFasting && !showNextPhaseCta && (
          <DurationSelector duration={duration} setDuration={setDuration} />
        )}

        {showNextPhaseCta ? (
          <button
            onClick={handleStartNextPhase}
            disabled={isSubmitting}
            className="px-6 py-3 rounded-full bg-primary-container text-on-primary-container font-label-caps text-label-caps shadow-float hover:shadow-float-hover transition-shadow disabled:opacity-50"
          >
            {isSubmitting
              ? 'STARTING...'
              : justCompletedPhase === 'fasting'
                ? 'START EATING WINDOW'
                : 'START FAST'}
          </button>
        ) : (
          <button
            onClick={openConfirm}
            disabled={!isFasting && !duration}
            className="w-24 h-24 rounded-full bg-primary-container text-on-primary-container flex flex-col items-center justify-center shadow-float animate-pulse-glow hover:scale-105 active:scale-95 transition-transform duration-300 ease-glide disabled:opacity-50 disabled:animate-none"
          >
            {isFasting ? <Square size={20} /> : <Play size={20} />}
            <span className="font-label-caps text-label-caps mt-1">{isFasting ? 'STOP' : 'START'}</span>
          </button>
        )}
      </main>

      <Modal isOpen={showConfirm} onClose={closeConfirm} title={isFasting ? 'Stop Fasting' : 'Start Fasting'}>
        <p className="font-body-md text-body-md text-on-surface mb-6">
          Are you sure you want to {isFasting ? 'stop your current fast' : `start a ${duration ? formatTargetDuration(duration) : ''} fast`}?
        </p>
        {confirmError && (
          <p className="font-body-md text-body-md text-error text-sm px-1 mb-4">{confirmError}</p>
        )}
        <div className="flex gap-3">
          <button
            onClick={closeConfirm}
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

      <Modal isOpen={showNotifications} onClose={() => setShowNotifications(false)} title="Notifications">
        <EmptyState icon={BellOff} title="No notifications yet" subtitle="We'll let you know when there's something new." />
      </Modal>
    </div>
  )
}
```

Note: `phase` on `FastingClock` accepts `undefined` (via `phase?:` in props) but `useFasting()` returns `phase: Phase | null` — passing `null` is fine since `FastingClock`'s prop type is `'fasting' | 'eating' | null | undefined` via the default parameter (`phase = null`). Confirm prop typing compiles in Step 4.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/dashboard/DashboardClient.tsx" "app/(app)/dashboard/page.tsx" "app/(app)/layout.tsx"
git commit -m "feat: auto-complete phases at target and offer manual next-phase start on dashboard"
```

---

### Task 8: Settings — add Eating Window toggle and duration input

**Files:**
- Modify: `app/actions/profile.ts`
- Modify: `app/(app)/settings/page.tsx`
- Modify: `app/(app)/settings/SettingsClient.tsx`

**Interfaces:**
- Consumes: `updateProfile` (existing action, extended).
- Produces: none new for other tasks — this is the settings UI, terminal in the dependency chain.

- [ ] **Step 1: Extend `app/actions/profile.ts`**

In `app/actions/profile.ts`, update the interface and allow-list:

```ts
interface ProfileUpdateFields {
  full_name?: string
  birth_date?: string | null
  min_fasting_threshold_minutes?: number
  reminder_offset_minutes?: number
  weight_unit?: 'kg' | 'lb'
  notifications_enabled?: boolean
  timezone?: string
  daily_reminder_time?: string
  eating_window_enabled?: boolean
  eating_window_hours?: number
}

const ALLOWED_PROFILE_UPDATE_KEYS = [
  'full_name',
  'birth_date',
  'min_fasting_threshold_minutes',
  'reminder_offset_minutes',
  'weight_unit',
  'notifications_enabled',
  'timezone',
  'daily_reminder_time',
  'eating_window_enabled',
  'eating_window_hours',
] as const satisfies readonly (keyof ProfileUpdateFields)[]
```

Leave the rest of `updateProfile` unchanged — it already forwards only allow-listed keys.

- [ ] **Step 2: Extend `app/(app)/settings/page.tsx` select**

```tsx
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, avatar_url, birth_date, reminder_offset_minutes, min_fasting_threshold_minutes, weight_unit, notifications_enabled, daily_reminder_time, eating_window_enabled, eating_window_hours')
    .eq('id', user.id)
    .single()
```

- [ ] **Step 3: Extend `SettingsClient.tsx`**

Add to the `ProfileData` interface:

```ts
interface ProfileData {
  full_name: string | null
  avatar_url: string | null
  birth_date: string | null
  reminder_offset_minutes: number | null
  min_fasting_threshold_minutes: number | null
  weight_unit: string | null
  notifications_enabled: boolean | null
  daily_reminder_time: string | null
  eating_window_enabled: boolean | null
  eating_window_hours: number | null
}
```

Add state, near the other `useState` declarations at the top of `SettingsClient`:

```ts
  const [eatingWindowEnabled, setEatingWindowEnabled] = React.useState(initialProfile?.eating_window_enabled ?? false)
  const [eatingWindowHours, setEatingWindowHours] = React.useState(initialProfile?.eating_window_hours ?? 8)
```

Add the two new fields to the `handleSave` call's `updateProfile(...)` argument object:

```ts
    const result = await updateProfile({
      full_name: fullName,
      birth_date: birthDate || null,
      min_fasting_threshold_minutes: threshold,
      reminder_offset_minutes: reminderOffset,
      weight_unit: weightUnit,
      eating_window_enabled: eatingWindowEnabled,
      eating_window_hours: eatingWindowHours,
    })
```

Add a new `AccordionSection`, placed after the existing `Notifications` section (following the same `on/off` segmented-control pattern used for `notificationsEnabled` and the numeric-input pattern used for `threshold`/`reminderOffset`):

```tsx
      <AccordionSection title="Eating Window">
        <div className="flex items-center justify-between">
          <span className="font-body-md text-sm text-on-surface-variant">Track eating window</span>
          <button
            type="button"
            onClick={() => setEatingWindowEnabled((v) => !v)}
            className={`px-4 py-2 rounded-full font-label-caps text-label-caps ${
              eatingWindowEnabled
                ? 'bg-primary-container text-on-primary-container'
                : 'bg-surface-container text-on-surface-variant'
            }`}
          >
            {eatingWindowEnabled ? 'ON' : 'OFF'}
          </button>
        </div>
        {eatingWindowEnabled && (
          <label className="flex flex-col gap-1">
            <span className="font-body-md text-sm text-on-surface-variant">Eating window duration (hours)</span>
            <input
              type="number"
              min={1}
              max={23}
              value={eatingWindowHours}
              onChange={(e) => setEatingWindowHours(Number(e.target.value))}
              className="bg-surface-container rounded-2xl px-4 py-3 font-body-md text-body-md text-on-surface"
            />
          </label>
        )}
      </AccordionSection>
```

Find the exact insertion point by locating the closing `</AccordionSection>` of the `Notifications` section in the current file and adding the new block immediately after it, before whatever section (e.g. a "Save" button container) follows.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual UI check**

Run: `npm run dev`, open `/settings`, toggle "Track eating window" on, set a value, click Save, reload the page, and confirm the toggle and value persist. Then open `/dashboard`, confirm no visual regression when the toggle is off (default state).

- [ ] **Step 6: Commit**

```bash
git add app/actions/profile.ts "app/(app)/settings/page.tsx" "app/(app)/settings/SettingsClient.tsx"
git commit -m "feat: add eating window settings toggle and duration input"
```

---

### Task 9: End-to-end manual verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass, including the new ones from Task 2 and Task 3.

- [ ] **Step 2: Manual fast-cycle test with a short target**

In Settings, enable "Track eating window" and set eating window duration to a small value (e.g. treat 1 hour as `0.02` hours ≈ 72s for a fast manual test, or temporarily start a fast with a very small custom duration if `DurationSelector` allows it — otherwise wait out a short real duration). Start a fast, wait for it to reach target, and confirm:
- The clock auto-stops at target (no `+HH:MM:SS` overtime shown).
- The dashboard shows a "START EATING WINDOW" button.
- Tap it, confirm the clock switches to "EATING WINDOW" label/color and counts down from `eating_window_hours`.
- Let it reach target, confirm it auto-completes and shows "START FAST".

- [ ] **Step 3: Manual cron backstop test**

Start a fast (eating window enabled), then manually backdate its `start_time` in Supabase so `now >= start_time + target_duration_hours` (via `mcp__plugin_supabase_supabase__execute_sql`, e.g. `update fasting_logs set start_time = start_time - interval '1 day' where id = '<id>'`). Invoke the cron route locally: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/notifications`. Confirm via `list_tables`/`execute_sql` that the row's `status` is now `completed` and `end_time` equals `start_time + target_duration_hours` (not "now").

- [ ] **Step 4: No commit for this task** — verification only, nothing to stage.

---
