# Countdown Fasting Clock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change the main fasting clock from counting up elapsed time to counting down time remaining until the goal duration, flipping to a green "overtime" count-up once the goal is passed.

**Architecture:** A new pure helper `getRemainingSeconds` in `lib/fasting.ts` computes seconds left from the existing per-second elapsed-seconds tick. The clock component (renamed `ElapsedClock` → `FastingClock`) gains a `targetDuration` prop and switches its rendered string/color based on that helper's output. No changes to data fetching, context, server actions, or the FASTING/FAT BURNING stage badge.

**Tech Stack:** Next.js (App Router), React, TypeScript, Tailwind, date-fns, Vitest.

## Global Constraints

- No toggle between count-up/count-down modes — countdown fully replaces the old display (per approved spec).
- Overtime state uses the existing `text-secondary` / `bg-secondary-container` green tokens already used by the "FAT BURNING" badge — no new colors introduced.
- `formatElapsed` and `getFastingStage` in `lib/fasting.ts` keep their current names and signatures — unchanged.
- `computeStopOutcome`, `DurationSelector`, `FastingContext`, and the server actions in `app/actions/fasting.ts` are untouched.

---

### Task 1: Add `getRemainingSeconds` helper

**Files:**
- Modify: `lib/fasting.ts`
- Test: `lib/fasting.test.ts`

**Interfaces:**
- Produces: `getRemainingSeconds(targetHours: number, elapsedSeconds: number): number` — exported from `lib/fasting.ts`. Positive/zero result means time remains; negative result means the goal has been passed (magnitude = overtime seconds).

- [ ] **Step 1: Write the failing tests**

Add a new `describe` block at the end of `lib/fasting.test.ts` (after the existing `computeStopOutcome` block), and add `getRemainingSeconds` to the import on line 2:

```ts
import { formatElapsed, getFastingStage, computeStopOutcome, getRemainingSeconds } from './fasting'
```

```ts
describe('getRemainingSeconds', () => {
  it('returns positive seconds remaining before the goal', () => {
    // 16h target, 2h elapsed -> 14h remaining
    expect(getRemainingSeconds(16, 2 * 3600)).toBe(14 * 3600)
  })

  it('returns exactly zero at the goal', () => {
    expect(getRemainingSeconds(1, 3600)).toBe(0)
  })

  it('returns negative seconds once past the goal (overtime)', () => {
    // 1h target, 1h01m elapsed -> 60s overtime
    expect(getRemainingSeconds(1, 3660)).toBe(-60)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run lib/fasting.test.ts`
Expected: FAIL — `getRemainingSeconds` is not exported / not defined.

- [ ] **Step 3: Implement the helper**

In `lib/fasting.ts`, add this function after `getFastingStage` (currently lines 9-11) and before `computeStopOutcome`:

```ts
export function getRemainingSeconds(targetHours: number, elapsedSeconds: number): number {
  return targetHours * 3600 - elapsedSeconds
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run lib/fasting.test.ts`
Expected: PASS — all tests in the file, including the 3 new ones, pass.

- [ ] **Step 5: Commit**

```bash
git add lib/fasting.ts lib/fasting.test.ts
git commit -m "feat: add getRemainingSeconds helper for fasting countdown"
```

---

### Task 2: Rename clock component and switch it to countdown display

**Files:**
- Rename: `components/fasting/ElapsedClock.tsx` → `components/fasting/FastingClock.tsx`
- Modify: `app/(app)/dashboard/DashboardClient.tsx:7,74`

**Interfaces:**
- Consumes: `getRemainingSeconds(targetHours: number, elapsedSeconds: number): number` and `formatElapsed(totalSeconds: number): string` and `getFastingStage(elapsedHours: number): 'fasting' | 'fat_burning'` from `lib/fasting.ts` (Task 1 + pre-existing).
- Produces: `FastingClock` component with props `{ isFasting: boolean, startTime: Date | null, targetDuration: number | null }`, default export replaced by named export `FastingClock` (same export style as before, just renamed).

- [ ] **Step 1: Rename the file**

```bash
git mv components/fasting/ElapsedClock.tsx components/fasting/FastingClock.tsx
```

- [ ] **Step 2: Rewrite the component**

Replace the full contents of `components/fasting/FastingClock.tsx` with:

```tsx
'use client'

import * as React from 'react'
import { differenceInSeconds } from 'date-fns'
import { Flame } from 'lucide-react'
import { formatElapsed, getFastingStage, getRemainingSeconds } from '@/lib/fasting'

interface FastingClockProps {
  isFasting: boolean
  startTime: Date | null
  targetDuration: number | null
}

export function FastingClock({ isFasting, startTime, targetDuration }: FastingClockProps) {
  const [elapsedSeconds, setElapsedSeconds] = React.useState(0)

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
  const isOvertime = remainingSeconds !== null && remainingSeconds < 0
  const clockText = remainingSeconds === null
    ? formatElapsed(displaySeconds)
    : isOvertime
      ? `+${formatElapsed(-remainingSeconds)}`
      : formatElapsed(remainingSeconds)

  return (
    <div className="relative w-full aspect-square max-w-[320px] rounded-full flex flex-col items-center justify-center shadow-float bg-surface/50 backdrop-blur-md animate-float">
      <div className="absolute inset-0 rounded-full border border-surface-tint/5 pointer-events-none" />
      <div className="font-label-caps text-label-caps text-on-surface-variant mb-2 opacity-70">
        {isFasting ? 'CURRENT FAST' : 'READY TO FAST'}
      </div>
      <div
        className={`font-display-clock text-display-clock tracking-tighter leading-none mb-1 tabular-nums ${
          isOvertime ? 'text-secondary' : 'text-primary'
        }`}
      >
        {clockText}
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

Notes on the change from the old `ElapsedClock`:
- Added `targetDuration` prop and the `remainingSeconds` / `isOvertime` / `clockText` derivation.
- The clock `<div>`'s `className` changed from a static string with a hardcoded `text-primary` to a template literal that swaps `text-primary` for `text-secondary` when `isOvertime` is true.
- Idle state (`isFasting` false) is unaffected: `remainingSeconds` is `null` (since `isFasting` is false), so `clockText` falls back to `formatElapsed(displaySeconds)` where `displaySeconds` is `0`, i.e. still renders `00:00:00`.
- Defensive fallback: if `isFasting` is true but `targetDuration` is `null` (shouldn't happen given `DurationSelector` always sets a target before `startFast`), `remainingSeconds` is `null` and the clock falls back to plain elapsed count-up rather than crashing.

- [ ] **Step 3: Update the import and usage in `DashboardClient.tsx`**

In `app/(app)/dashboard/DashboardClient.tsx`, line 7, change:

```tsx
import { ElapsedClock } from '@/components/fasting/ElapsedClock'
```

to:

```tsx
import { FastingClock } from '@/components/fasting/FastingClock'
```

And line 74, change:

```tsx
<ElapsedClock isFasting={isFasting} startTime={startTime} />
```

to:

```tsx
<FastingClock isFasting={isFasting} startTime={startTime} targetDuration={targetDuration} />
```

(`targetDuration` is already destructured from `useFasting()` on line 17 of this file — no other change needed there.)

- [ ] **Step 4: Run the full test suite and type check**

Run: `pnpm vitest run`
Expected: PASS — all existing tests (including Task 1's new ones) still pass; no test references the old `ElapsedClock` name.

Run: `pnpm tsc --noEmit`
Expected: No errors. In particular, confirms no other file still imports `@/components/fasting/ElapsedClock`.

- [ ] **Step 5: Manually verify in the browser**

Run: `pnpm dev`

In the browser:
1. On the dashboard, pick a short custom duration (e.g. 1 hour) via `DurationSelector` and start a fast.
2. Confirm the clock now shows a large number counting **down** from `01:00:00`, in the same orange (`text-primary`) color as before.
3. Confirm the "CURRENT FAST" label and "FASTING"/"FAT BURNING" badge still render as before.
4. To verify the overtime flip without waiting an hour, temporarily change your system clock forward past the goal (or start a fast with a very short custom duration if the app's clamp allows it, e.g. the minimum the custom prompt accepts), and confirm the clock shows `+00:00:0X` counting up in green (`text-secondary`) once the goal is passed.
5. Stop the fast and confirm the idle state still shows `READY TO FAST` / `00:00:00`.
6. Revert any system clock change made for step 4.

Stop the dev server after verifying.

- [ ] **Step 6: Commit**

```bash
git add components/fasting/FastingClock.tsx app/\(app\)/dashboard/DashboardClient.tsx
git status
```

Confirm the status shows `renamed: components/fasting/ElapsedClock.tsx -> components/fasting/FastingClock.tsx` and `modified: app/(app)/dashboard/DashboardClient.tsx`, then:

```bash
git commit -m "feat: count down fasting clock to goal, flip to overtime past it"
```
