# Stats and Settings Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working Stats page (weight trend + fasting streak/completion trends) and Settings page (profile, fasting preferences, sign out), and wire the existing but unused `min_fasting_threshold_minutes` profile column into the actual stop-fast logic.

**Architecture:** Two new routes (`/stats`, `/settings`) follow the codebase's existing server-page-fetches / client-component-renders split (see `history/page.tsx` + `HistoryClient.tsx`). New pure helpers go in `lib/`. New mutations go in `app/actions/` as server actions returning `{ error }` or `{ success: true, ... }`, matching `app/actions/fasting.ts`. Charts are hand-built SVG + framer-motion components (no new chart dependency), matching `FastingClock`'s visual style.

**Tech Stack:** Next.js App Router, React 19, Supabase (`@supabase/ssr`), Tailwind v4 (custom design tokens in `app/globals.css`), framer-motion, date-fns, vitest.

## Global Constraints

- Design tokens only — no raw hex colors or arbitrary Tailwind values; use existing classes (`bg-surface-container-low`, `text-on-surface-variant`, `shadow-float`, `font-label-caps`/`text-label-caps`, etc.) as seen throughout `components/fasting/*` and `app/(app)/history/HistoryClient.tsx`.
- Server actions are the only mutation path — no client-side Supabase writes (matches `app/actions/fasting.ts`, `app/(auth)/actions.ts`).
- No new npm dependencies (spec explicitly rejected adding a chart library).
- `profiles.weight_unit` is `'kg' | 'lb'`, default `'kg'`, added via migration in Task 1.
- Push notifications (actually sending reminders) are explicitly out of scope — `reminder_offset_minutes` is stored only.
- Reference spec: `docs/superpowers/specs/2026-07-16-chart-and-settings-pages-design.md`.

---

### Task 1: Add `weight_unit` column to `profiles`

**Files:**
- None (Supabase schema migration via MCP tool, project id `sishawogcismoegecigd`)

**Interfaces:**
- Produces: `profiles.weight_unit` column (`text`, not null, default `'kg'`, check `in ('kg','lb')`) — consumed by Tasks 9 and 10.

- [ ] **Step 1: Apply the migration**

Use the Supabase MCP `apply_migration` tool with:
- `project_id`: `sishawogcismoegecigd`
- `name`: `add_profiles_weight_unit`
- `query`:
```sql
alter table public.profiles
  add column weight_unit text not null default 'kg'
  check (weight_unit in ('kg', 'lb'));
```

- [ ] **Step 2: Verify the column exists**

Use the Supabase MCP `execute_sql` tool with `project_id: sishawogcismoegecigd`:
```sql
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles' and column_name = 'weight_unit';
```
Expected: one row, `column_name = weight_unit`, `data_type = text`, `column_default = 'kg'::text`.

- [ ] **Step 3: Commit**

This task has no local file changes to commit (schema-only). Skip commit; proceed to Task 2.

---

### Task 2: Weight unit conversion helpers

**Files:**
- Create: `lib/units.ts`
- Test: `lib/units.test.ts`

**Interfaces:**
- Produces: `kgToLb(kg: number): number`, `lbToKg(lb: number): number` — consumed by Task 9 (`StatsClient.tsx`).

- [ ] **Step 1: Write the failing test**

Create `lib/units.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { kgToLb, lbToKg } from './units'

describe('kgToLb', () => {
  it('converts a known reference value', () => {
    expect(kgToLb(100)).toBeCloseTo(220.46, 1)
  })

  it('converts zero', () => {
    expect(kgToLb(0)).toBe(0)
  })
})

describe('lbToKg', () => {
  it('converts a known reference value', () => {
    expect(lbToKg(220.462)).toBeCloseTo(100, 1)
  })
})

describe('round-trip', () => {
  it('kg -> lb -> kg returns the original value', () => {
    expect(lbToKg(kgToLb(72.5))).toBeCloseTo(72.5, 6)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/units.test.ts`
Expected: FAIL — `Cannot find module './units'` (file doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `lib/units.ts`:
```ts
const KG_TO_LB = 2.2046226218

export function kgToLb(kg: number): number {
  return kg * KG_TO_LB
}

export function lbToKg(lb: number): number {
  return lb / KG_TO_LB
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/units.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/units.ts lib/units.test.ts
git commit -m "feat: add kg/lb weight conversion helpers"
```

---

### Task 3: Streak and completion-rate helpers

**Files:**
- Modify: `lib/fasting.ts`
- Modify: `lib/fasting.test.ts`

**Interfaces:**
- Consumes: nothing new (pure functions over caller-supplied arrays).
- Produces: `export interface StreakLog { start_time: string; status: 'completed' | 'missed' | 'partial' }`, `getCurrentStreak(logs: StreakLog[]): number`, `getCompletionRate(logs: StreakLog[], now: Date, windowDays?: number): number` — consumed by Task 9 (`StatsClient.tsx`) and Task 8 (`FastingTrendsChart.tsx`, via the same shape).

- [ ] **Step 1: Write the failing tests**

Append to `lib/fasting.test.ts` (add `getCurrentStreak, getCompletionRate` to the existing import on line 2):
```ts
import { describe, it, expect } from 'vitest'
import { formatElapsed, getFastingStage, computeStopOutcome, getRemainingSeconds, getCurrentStreak, getCompletionRate } from './fasting'
```
Then append at the end of the file:
```ts

describe('getCurrentStreak', () => {
  it('returns 0 for empty history', () => {
    expect(getCurrentStreak([])).toBe(0)
  })

  it('counts consecutive completed fasts from the most recent', () => {
    const logs = [
      { start_time: '2026-07-14T08:00:00.000Z', status: 'completed' as const },
      { start_time: '2026-07-13T08:00:00.000Z', status: 'completed' as const },
      { start_time: '2026-07-12T08:00:00.000Z', status: 'missed' as const },
      { start_time: '2026-07-11T08:00:00.000Z', status: 'completed' as const },
    ]
    expect(getCurrentStreak(logs)).toBe(2)
  })

  it('is unaffected by input order (sorts internally)', () => {
    const logs = [
      { start_time: '2026-07-12T08:00:00.000Z', status: 'missed' as const },
      { start_time: '2026-07-14T08:00:00.000Z', status: 'completed' as const },
      { start_time: '2026-07-13T08:00:00.000Z', status: 'completed' as const },
    ]
    expect(getCurrentStreak(logs)).toBe(2)
  })

  it('returns 0 when the most recent fast was missed', () => {
    const logs = [
      { start_time: '2026-07-14T08:00:00.000Z', status: 'missed' as const },
      { start_time: '2026-07-13T08:00:00.000Z', status: 'completed' as const },
    ]
    expect(getCurrentStreak(logs)).toBe(0)
  })
})

describe('getCompletionRate', () => {
  const now = new Date('2026-07-16T12:00:00.000Z')

  it('returns 0 for empty history', () => {
    expect(getCompletionRate([], now)).toBe(0)
  })

  it('computes percentage completed within the window', () => {
    const logs = [
      { start_time: '2026-07-15T08:00:00.000Z', status: 'completed' as const },
      { start_time: '2026-07-14T08:00:00.000Z', status: 'completed' as const },
      { start_time: '2026-07-13T08:00:00.000Z', status: 'missed' as const },
      { start_time: '2026-07-12T08:00:00.000Z', status: 'completed' as const },
    ]
    expect(getCompletionRate(logs, now)).toBe(75)
  })

  it('excludes fasts older than the window', () => {
    const logs = [
      { start_time: '2026-07-15T08:00:00.000Z', status: 'completed' as const },
      { start_time: '2026-05-01T08:00:00.000Z', status: 'missed' as const },
    ]
    expect(getCompletionRate(logs, now)).toBe(100)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/fasting.test.ts`
Expected: FAIL — `getCurrentStreak`/`getCompletionRate` are not exported from `./fasting`.

- [ ] **Step 3: Write minimal implementation**

Append to `lib/fasting.ts`:
```ts

export interface StreakLog {
  start_time: string
  status: 'completed' | 'missed' | 'partial'
}

export function getCurrentStreak(logs: StreakLog[]): number {
  const sorted = [...logs].sort(
    (a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime()
  )

  let streak = 0
  for (const log of sorted) {
    if (log.status !== 'completed') break
    streak++
  }
  return streak
}

export function getCompletionRate(logs: StreakLog[], now: Date, windowDays = 30): number {
  const cutoff = now.getTime() - windowDays * 24 * 60 * 60 * 1000
  const inWindow = logs.filter((log) => new Date(log.start_time).getTime() >= cutoff)

  if (inWindow.length === 0) return 0

  const completed = inWindow.filter((log) => log.status === 'completed').length
  return Math.round((completed / inWindow.length) * 100)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/fasting.test.ts`
Expected: PASS (all tests, including the pre-existing `formatElapsed`/`getFastingStage`/`computeStopOutcome`/`getRemainingSeconds` suites)

- [ ] **Step 5: Commit**

```bash
git add lib/fasting.ts lib/fasting.test.ts
git commit -m "feat: add getCurrentStreak and getCompletionRate helpers"
```

---

### Task 4: Wire `min_fasting_threshold_minutes` into stop-fast logic

**Files:**
- Modify: `app/(app)/dashboard/DashboardClient.tsx:12-16,38-39`

**Interfaces:**
- Consumes: `computeStopOutcome(startTime: Date, targetHours: number, now: Date, thresholdMinutes?: number)` from `lib/fasting.ts` (already exists — unchanged signature).
- Produces: nothing new for later tasks — this is a leaf wiring change.

- [ ] **Step 1: Update the props interface and destructure the threshold**

In `app/(app)/dashboard/DashboardClient.tsx`, replace lines 12-23:
```tsx
interface DashboardClientProps {
  initialProfile: { full_name: string | null }
}

export default function DashboardClient({ initialProfile }: DashboardClientProps) {
  const { isFasting, startTime, targetDuration, activeFastId, startFast, stopFast } = useFasting()
  const [duration, setDuration] = React.useState<number | null>(targetDuration)
  const [showConfirm, setShowConfirm] = React.useState(false)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [confirmError, setConfirmError] = React.useState<string | null>(null)

  const firstName = initialProfile.full_name?.split(' ')[0] || 'there'
```
with:
```tsx
interface DashboardClientProps {
  initialProfile: { full_name: string | null; min_fasting_threshold_minutes?: number | null }
}

export default function DashboardClient({ initialProfile }: DashboardClientProps) {
  const { isFasting, startTime, targetDuration, activeFastId, startFast, stopFast } = useFasting()
  const [duration, setDuration] = React.useState<number | null>(targetDuration)
  const [showConfirm, setShowConfirm] = React.useState(false)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [confirmError, setConfirmError] = React.useState<string | null>(null)

  const firstName = initialProfile.full_name?.split(' ')[0] || 'there'
  const thresholdMinutes = initialProfile.min_fasting_threshold_minutes ?? 5
```

- [ ] **Step 2: Pass the threshold into `computeStopOutcome`**

Replace line 39:
```tsx
      const outcome = computeStopOutcome(startTime, targetDuration, new Date())
```
with:
```tsx
      const outcome = computeStopOutcome(startTime, targetDuration, new Date(), thresholdMinutes)
```

- [ ] **Step 3: Run the existing test suite (regression check)**

Run: `npm test`
Expected: PASS — `computeStopOutcome`'s custom-threshold behavior is already covered by the existing `lib/fasting.test.ts` suite; this task only changes what value the caller passes, so no new automated test is needed. `app/(app)/dashboard/page.tsx` already does `select('*')` when fetching the profile, so `min_fasting_threshold_minutes` is already included in `initialProfile` — no page.tsx change required.

- [ ] **Step 4: Manual verification**

Run `npm run dev`, log in, and via the Supabase MCP `execute_sql` tool temporarily set a large threshold for your test user:
```sql
update public.profiles set min_fasting_threshold_minutes = 120 where id = 'd6c5f390-6d2e-4468-bdb3-e19707df0656';
```
Start a fast, stop it after less than 2 minutes — confirm it does **not** appear in History (discarded, since elapsed < 120 min threshold). Then restore the default:
```sql
update public.profiles set min_fasting_threshold_minutes = 5 where id = 'd6c5f390-6d2e-4468-bdb3-e19707df0656';
```

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/dashboard/DashboardClient.tsx"
git commit -m "feat: wire min_fasting_threshold_minutes into stop-fast logic"
```

---

### Task 5: `logWeight` server action

**Files:**
- Create: `app/actions/health.ts`

**Interfaces:**
- Consumes: `utils/supabase/server`'s `createClient()` (existing, used by `app/(app)/dashboard/page.tsx` and `app/(app)/history/page.tsx`).
- Produces: `logWeight(value: number): Promise<{ error: string } | { success: true; data: { id: string; value: string; created_at: string } }>` — consumed by Task 9 (`StatsClient.tsx`).

- [ ] **Step 1: Write the server action**

Create `app/actions/health.ts`:
```ts
'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function logWeight(value: number) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data, error } = await supabase
    .from('health_logs')
    .insert({ user_id: user.id, log_type: 'weight', value: String(value) })
    .select('id, value, created_at')
    .single()

  if (error) return { error: error.message }
  revalidatePath('/stats', 'page')
  return { success: true as const, data }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors referencing `app/actions/health.ts`.

There's no automated test here — this is a thin Supabase insert wrapper with no branching logic, matching `app/actions/fasting.ts`'s existing (untested) server actions. Its behavior is verified manually in Task 9 once `StatsClient.tsx` calls it from the UI.

- [ ] **Step 3: Commit**

```bash
git add app/actions/health.ts
git commit -m "feat: add logWeight server action"
```

---

### Task 6: `updateProfile`, `uploadAvatar`, and `signOut` server actions

**Files:**
- Create: `app/actions/profile.ts`
- Modify: `app/(auth)/actions.ts`

**Interfaces:**
- Consumes: `utils/supabase/server`'s `createClient()`; the `avatars` storage bucket (already exists in the `sishawogcismoegecigd` Supabase project).
- Produces:
  - `updateProfile(fields: { full_name?: string; birth_date?: string | null; min_fasting_threshold_minutes?: number; reminder_offset_minutes?: number; weight_unit?: 'kg' | 'lb' }): Promise<{ error: string } | { success: true }>`
  - `uploadAvatar(formData: FormData): Promise<{ error: string } | { success: true; url: string }>` (expects a `File` under the `'avatar'` key)
  - `signOut(): Promise<never>` (redirects, never returns normally)
  - All consumed by Task 10 (`SettingsClient.tsx`).

- [ ] **Step 1: Write `app/actions/profile.ts`**

```ts
'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

interface ProfileUpdateFields {
  full_name?: string
  birth_date?: string | null
  min_fasting_threshold_minutes?: number
  reminder_offset_minutes?: number
  weight_unit?: 'kg' | 'lb'
}

export async function updateProfile(fields: ProfileUpdateFields) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { error } = await supabase.from('profiles').update(fields).eq('id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/settings', 'page')
  revalidatePath('/dashboard', 'layout')
  return { success: true as const }
}

export async function uploadAvatar(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const file = formData.get('avatar')
  if (!(file instanceof File)) return { error: 'No file provided' }

  const ext = file.name.split('.').pop() || 'jpg'
  const path = `${user.id}/avatar-${Date.now()}.${ext}`

  const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
  if (uploadError) return { error: uploadError.message }

  const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(path)

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ avatar_url: publicUrlData.publicUrl })
    .eq('id', user.id)
  if (updateError) return { error: updateError.message }

  revalidatePath('/settings', 'page')
  revalidatePath('/dashboard', 'layout')
  return { success: true as const, url: publicUrlData.publicUrl }
}
```

- [ ] **Step 2: Add `signOut` to `app/(auth)/actions.ts`**

Add this import to the top of `app/(auth)/actions.ts` (alongside the existing ones — no change to existing imports needed since `createClient` and `redirect` are already imported):

Append at the end of `app/(auth)/actions.ts`:
```ts

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors referencing `app/actions/profile.ts` or `app/(auth)/actions.ts`.

As with Task 5, these are thin Supabase wrappers with no branching logic worth a unit test absent existing test infra for server actions (`app/actions/fasting.ts` has none either). Verified manually in Task 10.

- [ ] **Step 4: Commit**

```bash
git add app/actions/profile.ts "app/(auth)/actions.ts"
git commit -m "feat: add updateProfile, uploadAvatar, and signOut server actions"
```

---

### Task 7: `WeightChart` component

**Files:**
- Create: `components/stats/WeightChart.tsx`

**Interfaces:**
- Consumes: nothing external — pure presentational component.
- Produces: `export interface WeightEntry { id: string; value: number; created_at: string }`, `WeightChart({ entries: WeightEntry[]; unit: 'kg' | 'lb' })` — consumed by Task 9 (`StatsClient.tsx`). Caller must pass `entries.length > 0` (component assumes non-empty; empty state is the caller's responsibility, per Task 9).

- [ ] **Step 1: Write the component**

Create `components/stats/WeightChart.tsx`:
```tsx
'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { format, parseISO } from 'date-fns'

export interface WeightEntry {
  id: string
  value: number
  created_at: string
}

interface WeightChartProps {
  entries: WeightEntry[]
  unit: 'kg' | 'lb'
}

const WIDTH = 300
const HEIGHT = 140
const PADDING = 24

export function WeightChart({ entries, unit }: WeightChartProps) {
  const values = entries.map((e) => e.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1

  const points = entries.map((entry, index) => {
    const x = entries.length === 1
      ? WIDTH / 2
      : PADDING + (index / (entries.length - 1)) * (WIDTH - PADDING * 2)
    const y = HEIGHT - PADDING - ((entry.value - min) / range) * (HEIGHT - PADDING * 2)
    return { x, y, entry }
  })

  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ')

  const first = entries[0]
  const last = entries[entries.length - 1]

  return (
    <div className="w-full bg-surface-container-low rounded-3xl p-5 shadow-float">
      <div className="flex justify-between items-baseline mb-4">
        <span className="font-label-caps text-label-caps text-on-surface-variant">WEIGHT</span>
        <span className="font-body-md text-2xl font-semibold text-on-surface">
          {last.value.toFixed(1)} <span className="text-sm text-on-surface-variant">{unit}</span>
        </span>
      </div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-auto overflow-visible">
        <motion.path
          d={path}
          fill="none"
          className="stroke-primary"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }}
        />
        {points.map((p) => (
          <circle key={p.entry.id} cx={p.x} cy={p.y} r={3} className="fill-primary" />
        ))}
      </svg>
      <div className="flex justify-between mt-2 font-body-md text-xs text-on-surface-variant">
        <span>{format(parseISO(first.created_at), 'd MMM')}</span>
        <span>{format(parseISO(last.created_at), 'd MMM')}</span>
      </div>
    </div>
  )
}
```

Note: x-axis spacing is by entry index, not by real elapsed time between entries — a deliberate simplification consistent with the spec (irregular logging intervals would otherwise compress/stretch the line unpredictably for a first version).

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors referencing `components/stats/WeightChart.tsx`.

No automated test — this repo has no component-testing infrastructure (`@testing-library/react` isn't installed), and none of the existing presentational components (`FastingClock`, `DurationSelector`, `Modal`) have tests either. Verified visually in Task 9.

- [ ] **Step 3: Commit**

```bash
git add components/stats/WeightChart.tsx
git commit -m "feat: add WeightChart component"
```

---

### Task 8: `FastingTrendsChart` component

**Files:**
- Create: `components/stats/FastingTrendsChart.tsx`

**Interfaces:**
- Consumes: `StreakLog`-shaped data (structurally compatible with `lib/fasting.ts`'s `StreakLog`, extended with `id`, `end_time`, `target_duration_hours`).
- Produces: `export interface FastingLogSummary { id: string; start_time: string; end_time: string | null; target_duration_hours: number; status: 'completed' | 'missed' | 'partial' }`, `FastingTrendsChart({ logs: FastingLogSummary[]; streak: number; completionRate: number })` — consumed by Task 9 (`StatsClient.tsx`).

- [ ] **Step 1: Write the component**

Create `components/stats/FastingTrendsChart.tsx`:
```tsx
'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { differenceInMinutes, parseISO } from 'date-fns'

export interface FastingLogSummary {
  id: string
  start_time: string
  end_time: string | null
  target_duration_hours: number
  status: 'completed' | 'missed' | 'partial'
}

interface FastingTrendsChartProps {
  logs: FastingLogSummary[]
  streak: number
  completionRate: number
}

const BAR_AREA_HEIGHT = 96

const barColor: Record<FastingLogSummary['status'], string> = {
  completed: 'bg-secondary',
  missed: 'bg-error',
  partial: 'bg-tertiary',
}

export function FastingTrendsChart({ logs, streak, completionRate }: FastingTrendsChartProps) {
  const recent = [...logs]
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    .slice(-14)

  return (
    <div className="w-full bg-surface-container-low rounded-3xl p-5 shadow-float">
      <div className="flex gap-6 mb-5">
        <div>
          <div className="font-body-md text-2xl font-semibold text-on-surface">{streak}</div>
          <div className="font-label-caps text-label-caps text-on-surface-variant">STREAK</div>
        </div>
        <div>
          <div className="font-body-md text-2xl font-semibold text-on-surface">{completionRate}%</div>
          <div className="font-label-caps text-label-caps text-on-surface-variant">30-DAY RATE</div>
        </div>
      </div>

      {recent.length === 0 ? (
        <p className="font-body-md text-body-md text-on-surface-variant">No fasts recorded yet.</p>
      ) : (
        <div className="flex items-end gap-1.5" style={{ height: BAR_AREA_HEIGHT }}>
          {recent.map((log) => {
            const end = log.end_time ? parseISO(log.end_time) : parseISO(log.start_time)
            const minutes = differenceInMinutes(end, parseISO(log.start_time))
            const targetMinutes = log.target_duration_hours * 60
            const percent = Math.min(100, Math.round((minutes / targetMinutes) * 100))
            const heightPx = Math.max((percent / 100) * BAR_AREA_HEIGHT, 4)
            return (
              <motion.div
                key={log.id}
                initial={{ height: 0 }}
                animate={{ height: heightPx }}
                transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
                className={`flex-1 rounded-full ${barColor[log.status]}`}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
```

Note: bar height represents percentage of each fast's own target duration reached (capped at 100%), not raw duration in hours — this shows goal attainment per fast directly and reuses the same `duration / target` percentage formula already used in `HistoryClient.tsx`'s progress bars.

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors referencing `components/stats/FastingTrendsChart.tsx`.

No automated test, for the same reason as Task 7. Verified visually in Task 9.

- [ ] **Step 3: Commit**

```bash
git add components/stats/FastingTrendsChart.tsx
git commit -m "feat: add FastingTrendsChart component"
```

---

### Task 9: Assemble the Stats page

**Files:**
- Create: `app/(app)/stats/page.tsx`
- Create: `app/(app)/stats/StatsClient.tsx`

**Interfaces:**
- Consumes: `getCurrentStreak`, `getCompletionRate` from `lib/fasting.ts` (Task 3); `kgToLb`, `lbToKg` from `lib/units.ts` (Task 2); `logWeight` from `app/actions/health.ts` (Task 5); `WeightChart`, `WeightEntry` from `components/stats/WeightChart.tsx` (Task 7); `FastingTrendsChart`, `FastingLogSummary` from `components/stats/FastingTrendsChart.tsx` (Task 8).
- Produces: the `/stats` route, consumed by Task 11 (`BottomNav.tsx`).

- [ ] **Step 1: Write `app/(app)/stats/page.tsx`**

```tsx
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { StatsClient } from './StatsClient'

export default async function StatsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: fastingLogs } = await supabase
    .from('fasting_logs')
    .select('id, start_time, end_time, target_duration_hours, status')
    .eq('user_id', user.id)
    .neq('status', 'ongoing')
    .order('start_time', { ascending: false })

  const { data: weightLogs } = await supabase
    .from('health_logs')
    .select('id, value, created_at')
    .eq('user_id', user.id)
    .eq('log_type', 'weight')
    .order('created_at', { ascending: true })

  const { data: profile } = await supabase
    .from('profiles')
    .select('weight_unit')
    .eq('id', user.id)
    .single()

  return (
    <StatsClient
      fastingLogs={fastingLogs || []}
      weightLogs={weightLogs || []}
      weightUnit={(profile?.weight_unit as 'kg' | 'lb') || 'kg'}
    />
  )
}
```

- [ ] **Step 2: Write `app/(app)/stats/StatsClient.tsx`**

```tsx
'use client'

import * as React from 'react'
import { Plus } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { WeightChart, type WeightEntry } from '@/components/stats/WeightChart'
import { FastingTrendsChart, type FastingLogSummary } from '@/components/stats/FastingTrendsChart'
import { getCurrentStreak, getCompletionRate } from '@/lib/fasting'
import { kgToLb, lbToKg } from '@/lib/units'
import { logWeight } from '@/app/actions/health'

interface RawWeightLog {
  id: string
  value: string
  created_at: string
}

interface StatsClientProps {
  fastingLogs: FastingLogSummary[]
  weightLogs: RawWeightLog[]
  weightUnit: 'kg' | 'lb'
}

export function StatsClient({ fastingLogs, weightLogs, weightUnit }: StatsClientProps) {
  const [showAddWeight, setShowAddWeight] = React.useState(false)
  const [weightInput, setWeightInput] = React.useState('')
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const weightEntries: WeightEntry[] = weightLogs
    .map((log) => {
      const raw = Number(log.value)
      const value = weightUnit === 'lb' ? kgToLb(raw) : raw
      return { id: log.id, value, created_at: log.created_at }
    })
    .filter((entry) => !Number.isNaN(entry.value))

  const streak = getCurrentStreak(fastingLogs)
  const completionRate = getCompletionRate(fastingLogs, new Date())

  const openAddWeight = () => {
    setError(null)
    setWeightInput('')
    setShowAddWeight(true)
  }

  const handleAddWeight = async () => {
    const parsed = Number(weightInput)
    if (Number.isNaN(parsed) || parsed <= 0) {
      setError('Enter a valid weight')
      return
    }
    setIsSubmitting(true)
    setError(null)
    const kgValue = weightUnit === 'lb' ? lbToKg(parsed) : parsed
    const result = await logWeight(kgValue)
    setIsSubmitting(false)
    if (!result.success) {
      setError(result.error)
      return
    }
    setShowAddWeight(false)
  }

  return (
    <div className="flex flex-col flex-1 px-container-margin py-4 pb-32 gap-4">
      <header className="mb-2">
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-primary tracking-tighter">Stats</h1>
        <p className="font-body-md text-body-md text-on-surface-variant">Your progress over time.</p>
      </header>

      {weightEntries.length > 0 ? (
        <>
          <WeightChart entries={weightEntries} unit={weightUnit} />
          <button
            onClick={openAddWeight}
            className="self-end font-label-caps text-label-caps bg-surface-container-low text-on-surface px-4 py-2 rounded-full inline-flex items-center gap-2 shadow-float"
          >
            <Plus size={14} /> ADD WEIGHT
          </button>
        </>
      ) : (
        <div className="bg-surface-container-low rounded-3xl p-6 shadow-float text-center">
          <p className="font-body-md text-body-md text-on-surface-variant mb-4">No weight logged yet.</p>
          <button
            onClick={openAddWeight}
            className="font-label-caps text-label-caps bg-primary-container text-on-primary-container px-5 py-2.5 rounded-full inline-flex items-center gap-2"
          >
            <Plus size={16} /> ADD WEIGHT
          </button>
        </div>
      )}

      <FastingTrendsChart logs={fastingLogs} streak={streak} completionRate={completionRate} />

      <Modal isOpen={showAddWeight} onClose={() => setShowAddWeight(false)} title="Add weight">
        <input
          type="number"
          inputMode="decimal"
          value={weightInput}
          onChange={(e) => setWeightInput(e.target.value)}
          placeholder={`Weight in ${weightUnit}`}
          className="w-full bg-surface-container rounded-2xl px-4 py-3 font-body-md text-body-md text-on-surface mb-4"
        />
        {error && <p className="font-body-md text-sm text-error mb-4">{error}</p>}
        <button
          onClick={handleAddWeight}
          disabled={isSubmitting}
          className="w-full py-3 rounded-full font-label-caps text-label-caps bg-primary-container text-on-primary-container disabled:opacity-50"
        >
          {isSubmitting ? 'SAVING...' : 'SAVE'}
        </button>
      </Modal>
    </div>
  )
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors referencing `app/(app)/stats/`.

- [ ] **Step 4: Manual verification**

Run `npm run dev`, navigate to `http://localhost:3000/stats` while logged in:
- With no weight logs: confirm the "No weight logged yet" empty state and "ADD WEIGHT" button appear.
- Click "ADD WEIGHT", enter a value (e.g. `70`), save — confirm the modal closes and the weight chart now renders with that point.
- Add a second weight value — confirm the line chart draws between both points.
- Confirm the Fasting Trends card shows a streak number, a 30-day completion rate, and bars for existing `fasting_logs` history (from the History page's data).

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/stats"
git commit -m "feat: add Stats page with weight and fasting trend charts"
```

---

### Task 10: Assemble the Settings page

**Files:**
- Create: `app/(app)/settings/page.tsx`
- Create: `app/(app)/settings/SettingsClient.tsx`

**Interfaces:**
- Consumes: `updateProfile`, `uploadAvatar` from `app/actions/profile.ts` (Task 6); `signOut` from `app/(auth)/actions.ts` (Task 6).
- Produces: the `/settings` route, consumed by Task 11 (`BottomNav.tsx`).

- [ ] **Step 1: Write `app/(app)/settings/page.tsx`**

```tsx
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { SettingsClient } from './SettingsClient'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, avatar_url, birth_date, reminder_offset_minutes, min_fasting_threshold_minutes, weight_unit')
    .eq('id', user.id)
    .single()

  return <SettingsClient initialProfile={profile} />
}
```

- [ ] **Step 2: Write `app/(app)/settings/SettingsClient.tsx`**

```tsx
'use client'

import * as React from 'react'
import { LogOut } from 'lucide-react'
import { updateProfile, uploadAvatar } from '@/app/actions/profile'
import { signOut } from '@/app/(auth)/actions'

interface ProfileData {
  full_name: string | null
  avatar_url: string | null
  birth_date: string | null
  reminder_offset_minutes: number | null
  min_fasting_threshold_minutes: number | null
  weight_unit: string | null
}

export function SettingsClient({ initialProfile }: { initialProfile: ProfileData | null }) {
  const [fullName, setFullName] = React.useState(initialProfile?.full_name || '')
  const [birthDate, setBirthDate] = React.useState(initialProfile?.birth_date || '')
  const [threshold, setThreshold] = React.useState(initialProfile?.min_fasting_threshold_minutes ?? 5)
  const [reminderOffset, setReminderOffset] = React.useState(initialProfile?.reminder_offset_minutes ?? 15)
  const [weightUnit, setWeightUnit] = React.useState<'kg' | 'lb'>(
    initialProfile?.weight_unit === 'lb' ? 'lb' : 'kg'
  )
  const [avatarUrl, setAvatarUrl] = React.useState(initialProfile?.avatar_url || null)
  const [isSaving, setIsSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [avatarError, setAvatarError] = React.useState<string | null>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const handleSave = async () => {
    setIsSaving(true)
    setError(null)
    const result = await updateProfile({
      full_name: fullName,
      birth_date: birthDate || null,
      min_fasting_threshold_minutes: threshold,
      reminder_offset_minutes: reminderOffset,
      weight_unit: weightUnit,
    })
    setIsSaving(false)
    if (!result.success) {
      setError(result.error)
    }
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarError(null)
    const formData = new FormData()
    formData.set('avatar', file)
    const result = await uploadAvatar(formData)
    if (!result.success) {
      setAvatarError(result.error)
      return
    }
    setAvatarUrl(result.url)
  }

  return (
    <div className="flex flex-col flex-1 px-container-margin py-4 pb-32 gap-6">
      <header>
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-primary tracking-tighter">Settings</h1>
      </header>

      <section className="bg-surface-container-low rounded-3xl p-5 shadow-float flex flex-col gap-4">
        <span className="font-label-caps text-label-caps text-on-surface-variant">PROFILE</span>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-20 h-20 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center text-2xl font-semibold overflow-hidden self-center"
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
          ) : (
            (fullName || 'U').charAt(0).toUpperCase()
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleAvatarChange}
          className="hidden"
        />
        {avatarError && <p className="font-body-md text-sm text-error text-center">{avatarError}</p>}

        <label className="flex flex-col gap-1">
          <span className="font-body-md text-sm text-on-surface-variant">Full name</span>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="bg-surface-container rounded-2xl px-4 py-3 font-body-md text-body-md text-on-surface"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-body-md text-sm text-on-surface-variant">Birth date</span>
          <input
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            className="bg-surface-container rounded-2xl px-4 py-3 font-body-md text-body-md text-on-surface"
          />
        </label>
      </section>

      <section className="bg-surface-container-low rounded-3xl p-5 shadow-float flex flex-col gap-4">
        <span className="font-label-caps text-label-caps text-on-surface-variant">FASTING PREFERENCES</span>

        <label className="flex flex-col gap-1">
          <span className="font-body-md text-sm text-on-surface-variant">Minimum fasting threshold (minutes)</span>
          <input
            type="number"
            min={0}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="bg-surface-container rounded-2xl px-4 py-3 font-body-md text-body-md text-on-surface"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-body-md text-sm text-on-surface-variant">Reminder offset (minutes before goal)</span>
          <input
            type="number"
            min={0}
            value={reminderOffset}
            onChange={(e) => setReminderOffset(Number(e.target.value))}
            className="bg-surface-container rounded-2xl px-4 py-3 font-body-md text-body-md text-on-surface"
          />
        </label>

        <div className="flex flex-col gap-1">
          <span className="font-body-md text-sm text-on-surface-variant">Weight unit</span>
          <div className="flex gap-2">
            {(['kg', 'lb'] as const).map((unit) => (
              <button
                key={unit}
                type="button"
                onClick={() => setWeightUnit(unit)}
                className={`flex-1 py-2 rounded-full font-label-caps text-label-caps ${
                  weightUnit === unit
                    ? 'bg-primary-container text-on-primary-container'
                    : 'bg-surface-container text-on-surface-variant'
                }`}
              >
                {unit.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </section>

      {error && <p className="font-body-md text-sm text-error">{error}</p>}
      <button
        type="button"
        onClick={handleSave}
        disabled={isSaving}
        className="w-full py-3 rounded-full font-label-caps text-label-caps bg-primary-container text-on-primary-container disabled:opacity-50"
      >
        {isSaving ? 'SAVING...' : 'SAVE CHANGES'}
      </button>

      <form action={signOut}>
        <button
          type="submit"
          className="w-full py-3 rounded-full font-label-caps text-label-caps bg-error-container text-on-error-container flex items-center justify-center gap-2"
        >
          <LogOut size={16} /> SIGN OUT
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors referencing `app/(app)/settings/`.

- [ ] **Step 4: Manual verification**

Run `npm run dev`, navigate to `http://localhost:3000/settings` while logged in:
- Confirm existing profile values (full name, threshold=5, reminder=15, unit=kg) are pre-filled.
- Change full name and threshold, click "SAVE CHANGES" — confirm no error shown; reload the page and confirm the new values persisted.
- Tap the avatar circle, pick an image — confirm it uploads and displays without a page reload.
- Click "SIGN OUT" — confirm redirect to `/login` and that `/dashboard` now redirects back to `/login` (session cleared).
- Log back in and confirm the saved full name still shows on the Dashboard greeting ("Hi, ...").

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/settings"
git commit -m "feat: add Settings page for profile, preferences, and sign out"
```

---

### Task 11: Enable Stats and Settings in the bottom nav

**Files:**
- Modify: `components/layout/BottomNav.tsx:9-14`

**Interfaces:**
- Consumes: `/stats` route (Task 9), `/settings` route (Task 10).
- Produces: nothing further — this is the final integration point.

- [ ] **Step 1: Update the nav items**

Replace lines 9-14 in `components/layout/BottomNav.tsx`:
```tsx
const navItems = [
  { name: 'Home', href: '/dashboard', icon: Timer, enabled: true },
  { name: 'Stats', href: '/dashboard', icon: BarChart3, enabled: false },
  { name: 'History', href: '/history', icon: Clock, enabled: true },
  { name: 'Settings', href: '/dashboard', icon: Settings, enabled: false },
]
```
with:
```tsx
const navItems = [
  { name: 'Home', href: '/dashboard', icon: Timer, enabled: true },
  { name: 'Stats', href: '/stats', icon: BarChart3, enabled: true },
  { name: 'History', href: '/history', icon: Clock, enabled: true },
  { name: 'Settings', href: '/settings', icon: Settings, enabled: true },
]
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification**

Run `npm run dev`. From `/dashboard`, tap each of the four nav icons — confirm all four navigate correctly (Home, Stats, History, Settings) and the active tab is visually highlighted (`text-primary bg-secondary-container/30`) on each page.

- [ ] **Step 4: Run the full test suite (final regression check)**

Run: `npm test`
Expected: PASS (all suites: `formatElapsed`, `getFastingStage`, `computeStopOutcome`, `getRemainingSeconds`, `getCurrentStreak`, `getCompletionRate`, `kgToLb`/`lbToKg`).

- [ ] **Step 5: Commit**

```bash
git add components/layout/BottomNav.tsx
git commit -m "feat: enable Stats and Settings tabs in bottom nav"
```
