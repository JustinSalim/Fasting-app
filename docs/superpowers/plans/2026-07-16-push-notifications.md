# Push Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Real push notifications (survive the app/tab being closed) for four triggers: fast-goal-reached, pre-goal reminder, daily streak nudge, daily weight-log nudge. Users opt in from Settings with a configurable daily reminder time.

**Architecture:** A `push_subscriptions` table + new `profiles`/`fasting_logs` columns store opt-in state and per-fast notification dedup flags. Settings gets a client-side subscribe/unsubscribe flow (service worker + `PushManager`) backed by two new server actions. A Vercel Cron job hits `/api/cron/notifications` every 15 minutes; it uses a service-role Supabase client (bypasses RLS, since it acts across all users, not one session) plus pure, unit-tested trigger-check functions to decide what to send, and the `web-push` library to actually deliver.

**Tech Stack:** Next.js App Router (Route Handlers + Server Actions), Supabase (`@supabase/ssr` for user-scoped access, `@supabase/supabase-js` + service role key for the cron's cross-user access), `web-push` (new dependency), Vercel Cron, vitest.

## Global Constraints

- Design tokens only in UI — no raw hex colors or arbitrary Tailwind values; reuse existing classes as seen in `components/settings/SettingsClient.tsx`.
- Server actions are the only client-triggered mutation path (matches `app/actions/*.ts`); the cron route is the only place using the service-role client.
- One master "enable notifications" toggle — no per-trigger-type toggles (spec Non-goals).
- No in-app notification history/feed — the dashboard bell stays a placeholder (spec Non-goals).
- `reminder_offset_minutes` (existing `profiles` column) is reused as-is for the pre-goal reminder; no new column for it.
- Reference spec: `docs/superpowers/specs/2026-07-16-push-notifications-and-weight-detail-design.md`.
- Supabase project id: `sishawogcismoegecigd` (from `NEXT_PUBLIC_SUPABASE_URL`).

---

### Task 1: Database migration

**Files:**
- None (Supabase schema migration via MCP tool, project id `sishawogcismoegecigd`)

**Interfaces:**
- Produces: `push_subscriptions` table (`id`, `user_id`, `endpoint` unique, `p256dh`, `auth`, `created_at`), `profiles.notifications_enabled` (`boolean not null default false`), `profiles.timezone` (`text`, nullable), `profiles.daily_reminder_time` (`text`, nullable, `HH:mm`), `fasting_logs.target_notified_at` (`timestamptz`, nullable), `fasting_logs.reminder_notified_at` (`timestamptz`, nullable) — consumed by every later task in this plan.

- [ ] **Step 1: Apply the migration**

Use the Supabase MCP `apply_migration` tool with:
- `project_id`: `sishawogcismoegecigd`
- `name`: `add_push_notifications`
- `query`:
```sql
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

create policy "Users manage their own push subscriptions"
  on public.push_subscriptions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.profiles
  add column notifications_enabled boolean not null default false,
  add column timezone text,
  add column daily_reminder_time text;

alter table public.fasting_logs
  add column target_notified_at timestamptz,
  add column reminder_notified_at timestamptz;
```

- [ ] **Step 2: Verify the schema changes**

Use the Supabase MCP `execute_sql` tool with `project_id: sishawogcismoegecigd`:
```sql
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'profiles' and column_name in ('notifications_enabled', 'timezone', 'daily_reminder_time'))
    or (table_name = 'fasting_logs' and column_name in ('target_notified_at', 'reminder_notified_at'))
    or (table_name = 'push_subscriptions')
  )
order by table_name, column_name;
```
Expected: rows for all 5 new `profiles`/`fasting_logs` columns, plus the 5 `push_subscriptions` columns (`id`, `user_id`, `endpoint`, `p256dh`, `auth`, `created_at` — 6 total).

- [ ] **Step 3: Commit**

This task has no local file changes to commit (schema-only). Proceed to Task 2.

---

### Task 2: Pure notification trigger-check logic

**Files:**
- Create: `lib/notifications.ts`
- Test: `lib/notifications.test.ts`

**Interfaces:**
- Produces:
  - `shouldSendGoalReached(fast: FastProgress): boolean`
  - `shouldSendPreGoalReminder(fast: FastProgress, reminderOffsetMinutes: number): boolean`
  - `isSameLocalDate(isoTimestamp: string, timezone: string, nowUtc: Date): boolean`
  - `isWithinReminderWindow(nowLocalHHMM: string, dailyReminderTime: string, windowMinutes: number): boolean`
  - `interface FastProgress { elapsedMinutes: number; targetDurationHours: number; targetNotifiedAt: string | null; reminderNotifiedAt: string | null }`

  All four consumed by Task 7 (`app/api/cron/notifications/route.ts`).

- [ ] **Step 1: Write the failing tests**

Create `lib/notifications.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import {
  shouldSendGoalReached,
  shouldSendPreGoalReminder,
  isSameLocalDate,
  isWithinReminderWindow,
  type FastProgress,
} from './notifications'

function fast(overrides: Partial<FastProgress> = {}): FastProgress {
  return {
    elapsedMinutes: 0,
    targetDurationHours: 16,
    targetNotifiedAt: null,
    reminderNotifiedAt: null,
    ...overrides,
  }
}

describe('shouldSendGoalReached', () => {
  it('is false before the target', () => {
    expect(shouldSendGoalReached(fast({ elapsedMinutes: 900 }))).toBe(false)
  })

  it('is true once elapsed reaches the target', () => {
    expect(shouldSendGoalReached(fast({ elapsedMinutes: 960 }))).toBe(true)
  })

  it('is false if already notified', () => {
    expect(shouldSendGoalReached(fast({ elapsedMinutes: 1000, targetNotifiedAt: '2026-07-16T00:00:00Z' }))).toBe(false)
  })
})

describe('shouldSendPreGoalReminder', () => {
  it('is false well before the reminder window', () => {
    expect(shouldSendPreGoalReminder(fast({ elapsedMinutes: 900 }), 15)).toBe(false)
  })

  it('is true inside the reminder window before the target', () => {
    expect(shouldSendPreGoalReminder(fast({ elapsedMinutes: 950 }), 15)).toBe(true)
  })

  it('is false once the target itself is reached (goal-reached takes over)', () => {
    expect(shouldSendPreGoalReminder(fast({ elapsedMinutes: 960 }), 15)).toBe(false)
  })

  it('is false if the reminder was already sent', () => {
    expect(
      shouldSendPreGoalReminder(fast({ elapsedMinutes: 950, reminderNotifiedAt: '2026-07-16T00:00:00Z' }), 15)
    ).toBe(false)
  })

  it('is false if the goal was already notified', () => {
    expect(
      shouldSendPreGoalReminder(fast({ elapsedMinutes: 950, targetNotifiedAt: '2026-07-16T00:00:00Z' }), 15)
    ).toBe(false)
  })
})

describe('isSameLocalDate', () => {
  it('is true for two timestamps on the same local calendar day', () => {
    expect(isSameLocalDate('2026-07-16T23:30:00Z', 'America/New_York', new Date('2026-07-17T02:00:00Z'))).toBe(true)
  })

  it('is false across a local calendar day boundary', () => {
    expect(isSameLocalDate('2026-07-15T23:30:00Z', 'America/New_York', new Date('2026-07-17T02:00:00Z'))).toBe(false)
  })
})

describe('isWithinReminderWindow', () => {
  it('is true right at the reminder time', () => {
    expect(isWithinReminderWindow('20:00', '20:00', 15)).toBe(true)
  })

  it('is true a few minutes after the reminder time', () => {
    expect(isWithinReminderWindow('20:10', '20:00', 15)).toBe(true)
  })

  it('is false once the window has passed', () => {
    expect(isWithinReminderWindow('20:20', '20:00', 15)).toBe(false)
  })

  it('is false before the reminder time', () => {
    expect(isWithinReminderWindow('19:50', '20:00', 15)).toBe(false)
  })

  it('handles the midnight wraparound', () => {
    expect(isWithinReminderWindow('00:05', '23:55', 15)).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/notifications.test.ts`
Expected: FAIL — `Cannot find module './notifications'` (file doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `lib/notifications.ts`:
```ts
export interface FastProgress {
  elapsedMinutes: number
  targetDurationHours: number
  targetNotifiedAt: string | null
  reminderNotifiedAt: string | null
}

export function shouldSendGoalReached(fast: FastProgress): boolean {
  if (fast.targetNotifiedAt !== null) return false
  return fast.elapsedMinutes >= fast.targetDurationHours * 60
}

export function shouldSendPreGoalReminder(fast: FastProgress, reminderOffsetMinutes: number): boolean {
  if (fast.targetNotifiedAt !== null || fast.reminderNotifiedAt !== null) return false
  const targetMinutes = fast.targetDurationHours * 60
  // Once elapsed reaches the target itself, goal-reached owns the notification —
  // without this upper bound a skipped cron tick could fire both in one pass.
  return fast.elapsedMinutes >= targetMinutes - reminderOffsetMinutes && fast.elapsedMinutes < targetMinutes
}

export function isSameLocalDate(isoTimestamp: string, timezone: string, nowUtc: Date): boolean {
  const format = (d: Date) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
  return format(new Date(isoTimestamp)) === format(nowUtc)
}

function toMinutesSinceMidnight(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export function isWithinReminderWindow(nowLocalHHMM: string, dailyReminderTime: string, windowMinutes: number): boolean {
  const now = toMinutesSinceMidnight(nowLocalHHMM)
  const target = toMinutesSinceMidnight(dailyReminderTime)
  const diff = (now - target + 1440) % 1440
  return diff < windowMinutes
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/notifications.test.ts`
Expected: PASS (14 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/notifications.ts lib/notifications.test.ts
git commit -m "feat: add pure trigger-check logic for push notifications"
```

---

### Task 3: `sendPush` wrapper around `web-push`

**Files:**
- Create: `lib/push.ts`
- Test: `lib/push.test.ts`
- Modify: `package.json` (add `web-push` dependency, `@types/web-push` devDependency)

**Interfaces:**
- Produces:
  - `interface PushSubscriptionRecord { endpoint: string; p256dh: string; auth: string }`
  - `interface PushPayload { title: string; body: string; url: string }`
  - `sendPush(subscription: PushSubscriptionRecord, payload: PushPayload): Promise<{ delivered: true } | { delivered: false; expired: boolean }>`

  Consumed by Task 7 (`app/api/cron/notifications/route.ts`).

- [ ] **Step 1: Install the dependency**

Run: `pnpm add web-push`
Run: `pnpm add -D @types/web-push`

- [ ] **Step 2: Generate VAPID keys and add env vars**

Run: `npx web-push generate-vapid-keys`

This prints a public and private key pair. Add to `.env.local` (do not commit this file — it's already local-only):
```
VAPID_PUBLIC_KEY=<the printed public key>
VAPID_PRIVATE_KEY=<the printed private key>
VAPID_SUBJECT=mailto:justin.salim05@gmail.com
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<same public key, exposed to the browser for PushManager.subscribe>
```
When this app is deployed, the same four variables need to be added as Vercel project env vars (`vercel env add`), since `.env.local` is never deployed.

- [ ] **Step 3: Write the failing tests**

Create `lib/push.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import webpush from 'web-push'
import { sendPush } from './push'

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
}))

const subscription = { endpoint: 'https://push.example/abc', p256dh: 'p256dh-key', auth: 'auth-key' }
const payload = { title: 'Fast complete', body: "You've reached your fasting goal.", url: '/dashboard' }

describe('sendPush', () => {
  beforeEach(() => {
    vi.mocked(webpush.sendNotification).mockReset()
    process.env.VAPID_SUBJECT = 'mailto:test@example.com'
    process.env.VAPID_PUBLIC_KEY = 'public-key'
    process.env.VAPID_PRIVATE_KEY = 'private-key'
  })

  it('returns delivered true on success', async () => {
    vi.mocked(webpush.sendNotification).mockResolvedValue({} as never)
    const result = await sendPush(subscription, payload)
    expect(result).toEqual({ delivered: true })
    expect(webpush.sendNotification).toHaveBeenCalledWith(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      JSON.stringify(payload)
    )
  })

  it('marks the subscription expired on a 410 response', async () => {
    vi.mocked(webpush.sendNotification).mockRejectedValue({ statusCode: 410 })
    const result = await sendPush(subscription, payload)
    expect(result).toEqual({ delivered: false, expired: true })
  })

  it('marks the subscription expired on a 404 response', async () => {
    vi.mocked(webpush.sendNotification).mockRejectedValue({ statusCode: 404 })
    const result = await sendPush(subscription, payload)
    expect(result).toEqual({ delivered: false, expired: true })
  })

  it('does not mark expired on other errors', async () => {
    vi.mocked(webpush.sendNotification).mockRejectedValue({ statusCode: 500 })
    const result = await sendPush(subscription, payload)
    expect(result).toEqual({ delivered: false, expired: false })
  })
})
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run lib/push.test.ts`
Expected: FAIL — `Cannot find module './push'` (file doesn't exist yet).

- [ ] **Step 5: Write minimal implementation**

Create `lib/push.ts`:
```ts
import webpush from 'web-push'

export interface PushSubscriptionRecord {
  endpoint: string
  p256dh: string
  auth: string
}

export interface PushPayload {
  title: string
  body: string
  url: string
}

let configured = false

function ensureConfigured() {
  if (configured) return
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  )
  configured = true
}

export async function sendPush(
  subscription: PushSubscriptionRecord,
  payload: PushPayload
): Promise<{ delivered: true } | { delivered: false; expired: boolean }> {
  ensureConfigured()
  try {
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      JSON.stringify(payload)
    )
    return { delivered: true }
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode
    const expired = statusCode === 404 || statusCode === 410
    return { delivered: false, expired }
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run lib/push.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 7: Commit**

```bash
git add lib/push.ts lib/push.test.ts package.json pnpm-lock.yaml
git commit -m "feat: add sendPush wrapper around web-push"
```

(`.env.local` is git-ignored — verify with `git status` that it doesn't appear in the diff before committing.)

---

### Task 4: Server actions for subscribe/unsubscribe + profile fields

**Files:**
- Create: `app/actions/push.ts`
- Modify: `app/actions/profile.ts`

**Interfaces:**
- Produces:
  - `subscribeToPush(subscription: { endpoint: string; keys: { p256dh: string; auth: string } }): Promise<{ error: string } | { success: true }>`
  - `unsubscribeFromPush(endpoint: string): Promise<{ error: string } | { success: true }>`
  - `updateProfile` (existing) now also accepts `notifications_enabled?: boolean`, `timezone?: string`, `daily_reminder_time?: string`.

  Consumed by Task 6 (`SettingsClient.tsx`).

- [ ] **Step 1: Create the push server actions**

Create `app/actions/push.ts`:
```ts
'use server'

import { createClient } from '@/utils/supabase/server'

interface PushSubscriptionInput {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export async function subscribeToPush(subscription: PushSubscriptionInput) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: user.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
    { onConflict: 'endpoint' }
  )

  if (error) return { error: error.message }
  return { success: true as const }
}

export async function unsubscribeFromPush(endpoint: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  return { success: true as const }
}
```

- [ ] **Step 2: Extend `updateProfile`'s allow-list**

In `app/actions/profile.ts`, modify the `ProfileUpdateFields` interface and `ALLOWED_PROFILE_UPDATE_KEYS`:

Change:
```ts
interface ProfileUpdateFields {
  full_name?: string
  birth_date?: string | null
  min_fasting_threshold_minutes?: number
  reminder_offset_minutes?: number
  weight_unit?: 'kg' | 'lb'
}

const ALLOWED_PROFILE_UPDATE_KEYS = [
  'full_name',
  'birth_date',
  'min_fasting_threshold_minutes',
  'reminder_offset_minutes',
  'weight_unit',
] as const satisfies readonly (keyof ProfileUpdateFields)[]
```
to:
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
] as const satisfies readonly (keyof ProfileUpdateFields)[]
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/actions/push.ts app/actions/profile.ts
git commit -m "feat: add push subscribe/unsubscribe server actions and profile fields"
```

---

### Task 5: Service worker

**Files:**
- Create: `public/sw.js`

**Interfaces:**
- Produces: a service worker registered at `/sw.js`, consumed by Task 6's `navigator.serviceWorker.register('/sw.js')` call.

- [ ] **Step 1: Create the service worker**

Create `public/sw.js`:
```js
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {}
  const title = data.title || 'Fasting'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      data: { url: data.url || '/dashboard' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data && event.notification.data.url ? event.notification.data.url : '/dashboard'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(url) && 'focus' in client) return client.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    })
  )
})
```

- [ ] **Step 2: Verify it's served**

Run: `npm run dev`
Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/sw.js`
Expected: `200`

- [ ] **Step 3: Commit**

```bash
git add public/sw.js
git commit -m "feat: add service worker for push notifications"
```

---

### Task 6: Settings UI — opt-in flow

**Files:**
- Modify: `app/(app)/settings/SettingsClient.tsx`
- Modify: `components/fasting/FastingContext.tsx`

**Interfaces:**
- Consumes: `subscribeToPush`, `unsubscribeFromPush` (Task 4), `updateProfile` (existing, extended in Task 4), `NEXT_PUBLIC_VAPID_PUBLIC_KEY` env var (Task 3), `/sw.js` (Task 5).

- [ ] **Step 1: Remove the dead permission-request call**

In `components/fasting/FastingContext.tsx`, remove these lines from `startFast`:
```ts
    if (typeof window !== 'undefined' && 'Notification' in window) {
      Notification.requestPermission()
    }
```
`startFast` becomes:
```ts
  const startFast = (targetHours: number, id: string, start: Date) => {
    setIsFasting(true)
    setStartTime(start)
    setTargetDuration(targetHours)
    setActiveFastId(id)
  }
```

- [ ] **Step 2: Add notification state and the VAPID key helper to `SettingsClient.tsx`**

Add to the imports in `app/(app)/settings/SettingsClient.tsx`:
```tsx
import { subscribeToPush, unsubscribeFromPush } from '@/app/actions/push'
```

Add to `ProfileData`:
```tsx
interface ProfileData {
  full_name: string | null
  avatar_url: string | null
  birth_date: string | null
  reminder_offset_minutes: number | null
  min_fasting_threshold_minutes: number | null
  weight_unit: string | null
  notifications_enabled: boolean | null
  daily_reminder_time: string | null
}
```

Add a module-level helper (outside the component, alongside `toWebp`):
```tsx
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)))
}
```

Add state inside `SettingsClient`, alongside the other `useState` calls:
```tsx
  const [notificationsEnabled, setNotificationsEnabled] = React.useState(initialProfile?.notifications_enabled ?? false)
  const [dailyReminderTime, setDailyReminderTime] = React.useState(initialProfile?.daily_reminder_time || '20:00')
  const [notifError, setNotifError] = React.useState<string | null>(null)
```

- [ ] **Step 3: Add enable/disable handlers**

Add inside `SettingsClient`, alongside `handleSave`:
```tsx
  const handleEnableNotifications = async () => {
    setNotifError(null)
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setNotifError('Push notifications are not supported in this browser')
      return
    }
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      setNotifError('Notification permission was not granted')
      return
    }
    const registration = await navigator.serviceWorker.register('/sw.js')
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
    })
    const json = subscription.toJSON()
    const result = await subscribeToPush({
      endpoint: json.endpoint!,
      keys: { p256dh: json.keys!.p256dh!, auth: json.keys!.auth! },
    })
    if (!result.success) {
      setNotifError(result.error)
      return
    }
    await updateProfile({
      notifications_enabled: true,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      daily_reminder_time: dailyReminderTime,
    })
    setNotificationsEnabled(true)
  }

  const handleDisableNotifications = async () => {
    setNotifError(null)
    const registration = await navigator.serviceWorker.getRegistration()
    const subscription = await registration?.pushManager.getSubscription()
    if (subscription) {
      await unsubscribeFromPush(subscription.endpoint)
      await subscription.unsubscribe()
    }
    await updateProfile({ notifications_enabled: false })
    setNotificationsEnabled(false)
  }

  const handleReminderTimeChange = async (value: string) => {
    setDailyReminderTime(value)
    if (notificationsEnabled) {
      await updateProfile({ daily_reminder_time: value })
    }
  }
```

- [ ] **Step 4: Add the Notifications section to the JSX**

In `app/(app)/settings/SettingsClient.tsx`, add a new `AccordionSection` right after the closing `</AccordionSection>` of "Preferences" and before the `{error && ...}` block:
```tsx
      <AccordionSection title="Notifications">
        <div className="flex items-center justify-between">
          <span className="font-body-md text-sm text-on-surface-variant">Enable notifications</span>
          <button
            type="button"
            onClick={notificationsEnabled ? handleDisableNotifications : handleEnableNotifications}
            className={`px-4 py-2 rounded-full font-label-caps text-label-caps ${
              notificationsEnabled
                ? 'bg-primary-container text-on-primary-container'
                : 'bg-surface-container text-on-surface-variant'
            }`}
          >
            {notificationsEnabled ? 'ON' : 'OFF'}
          </button>
        </div>
        {notificationsEnabled && (
          <label className="flex flex-col gap-1">
            <span className="font-body-md text-sm text-on-surface-variant">Daily reminder time</span>
            <input
              type="time"
              value={dailyReminderTime}
              onChange={(e) => handleReminderTimeChange(e.target.value)}
              className="bg-surface-container rounded-2xl px-4 py-3 font-body-md text-body-md text-on-surface"
            />
          </label>
        )}
        {notifError && <p className="font-body-md text-sm text-error">{notifError}</p>}
      </AccordionSection>
```

- [ ] **Step 5: Pass the new profile fields from the server page**

In `app/(app)/settings/page.tsx`, change:
```ts
    .select('full_name, avatar_url, birth_date, reminder_offset_minutes, min_fasting_threshold_minutes, weight_unit')
```
to:
```ts
    .select('full_name, avatar_url, birth_date, reminder_offset_minutes, min_fasting_threshold_minutes, weight_unit, notifications_enabled, daily_reminder_time')
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Verify manually in the browser**

Run: `npm run dev`

Open `http://localhost:3000/settings`, expand "Notifications":
1. Click the OFF toggle → browser's native permission prompt appears → click Allow.
2. Toggle flips to ON, a reminder time input appears.
3. Reload the page → toggle is still ON and the time is preserved (confirms `updateProfile` + `subscribeToPush` both persisted).
4. Open browser devtools → Application → Service Workers → confirm `sw.js` is registered and activated.
5. Click ON to disable → toggle flips back to OFF, reminder time input disappears.

- [ ] **Step 8: Commit**

```bash
git add app/\(app\)/settings/SettingsClient.tsx app/\(app\)/settings/page.tsx components/fasting/FastingContext.tsx
git commit -m "feat: add notification opt-in flow to Settings"
```

---

### Task 7: Cron route — decide and send

**Files:**
- Create: `utils/supabase/admin.ts`
- Create: `app/api/cron/notifications/route.ts`
- Create: `vercel.json`

**Interfaces:**
- Consumes: `sendPush`, `PushSubscriptionRecord`, `PushPayload` (Task 3); `shouldSendGoalReached`, `shouldSendPreGoalReminder`, `isSameLocalDate`, `isWithinReminderWindow`, `FastProgress` (Task 2).

- [ ] **Step 1: Add the service-role Supabase client**

Create `utils/supabase/admin.ts`:
```ts
import { createClient } from '@supabase/supabase-js'

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
```

This bypasses row-level security — it must never be imported from client code or from a user-facing server action, only from the cron route below.

- [ ] **Step 2: Add `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` env vars**

In the Supabase dashboard (Project Settings → API), copy the `service_role` secret key. Add to `.env.local`:
```
SUPABASE_SERVICE_ROLE_KEY=<the service_role key>
CRON_SECRET=<any random string, e.g. output of `openssl rand -hex 32`>
```
Both need to be added as Vercel project env vars before this ships to production (`vercel env add SUPABASE_SERVICE_ROLE_KEY`, `vercel env add CRON_SECRET`).

- [ ] **Step 3: Write the cron route**

Create `app/api/cron/notifications/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { sendPush, type PushSubscriptionRecord } from '@/lib/push'
import {
  shouldSendGoalReached,
  shouldSendPreGoalReminder,
  isSameLocalDate,
  isWithinReminderWindow,
} from '@/lib/notifications'

const WINDOW_MINUTES = 15
const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const now = new Date()

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, timezone, daily_reminder_time, reminder_offset_minutes')
    .eq('notifications_enabled', true)

  for (const profile of profiles ?? []) {
    const { data: subscriptions } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', profile.id)

    if (!subscriptions || subscriptions.length === 0) continue

    const send = async (title: string, body: string, url: string) => {
      for (const sub of subscriptions as (PushSubscriptionRecord & { id: string })[]) {
        const result = await sendPush(sub, { title, body, url })
        if (!result.delivered && result.expired) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id)
        }
      }
    }

    const { data: ongoingFasts } = await supabase
      .from('fasting_logs')
      .select('id, start_time, target_duration_hours, target_notified_at, reminder_notified_at')
      .eq('user_id', profile.id)
      .eq('status', 'ongoing')

    for (const f of ongoingFasts ?? []) {
      const elapsedMinutes = (now.getTime() - new Date(f.start_time).getTime()) / 60000
      const progress = {
        elapsedMinutes,
        targetDurationHours: f.target_duration_hours,
        targetNotifiedAt: f.target_notified_at,
        reminderNotifiedAt: f.reminder_notified_at,
      }

      if (shouldSendGoalReached(progress)) {
        await send('Fast complete', "You've reached your fasting goal.", '/dashboard')
        await supabase.from('fasting_logs').update({ target_notified_at: now.toISOString() }).eq('id', f.id)
      } else if (shouldSendPreGoalReminder(progress, profile.reminder_offset_minutes ?? 15)) {
        await send('Almost there', "You're almost at your fasting goal.", '/dashboard')
        await supabase.from('fasting_logs').update({ reminder_notified_at: now.toISOString() }).eq('id', f.id)
      }
    }

    if (!profile.timezone || !profile.daily_reminder_time) continue

    const nowLocalHHMM = new Intl.DateTimeFormat('en-GB', {
      timeZone: profile.timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(now)

    if (!isWithinReminderWindow(nowLocalHHMM, profile.daily_reminder_time, WINDOW_MINUTES)) continue

    const { data: recentFasts } = await supabase
      .from('fasting_logs')
      .select('start_time')
      .eq('user_id', profile.id)
      .gte('start_time', new Date(now.getTime() - TWO_DAYS_MS).toISOString())
      .order('start_time', { ascending: false })
      .limit(1)

    const startedToday = !!recentFasts?.[0] && isSameLocalDate(recentFasts[0].start_time, profile.timezone, now)
    if (!startedToday && (!ongoingFasts || ongoingFasts.length === 0)) {
      await send("Don't lose your streak", "You haven't started a fast today.", '/dashboard')
    }

    const { data: recentWeights } = await supabase
      .from('health_logs')
      .select('created_at')
      .eq('user_id', profile.id)
      .eq('log_type', 'weight')
      .gte('created_at', new Date(now.getTime() - TWO_DAYS_MS).toISOString())
      .order('created_at', { ascending: false })
      .limit(1)

    const loggedWeightToday = !!recentWeights?.[0] && isSameLocalDate(recentWeights[0].created_at, profile.timezone, now)
    if (!loggedWeightToday) {
      await send("Log today's weight", 'Keep your weight trend up to date.', '/stats')
    }
  }

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 4: Add the Vercel Cron schedule**

Create `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/cron/notifications",
      "schedule": "*/15 * * * *"
    }
  ]
}
```

> This schedule requires a Vercel Pro plan or higher — Hobby plan cron jobs are limited to once-daily execution. Confirm the plan before deploying, or this cron simply won't run at the intended cadence.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Verify manually against local dev**

Run: `npm run dev`

Without the header (should be rejected):
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/cron/notifications
```
Expected: `401`

With the header (reads `CRON_SECRET` from `.env.local`):
```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/notifications
```
Expected: `{"success":true}`, with no server-side errors in the `npm run dev` terminal output.

To exercise an actual trigger end-to-end: in Settings, enable notifications on a real device/browser; start a fast with a very short target (e.g. 0.02 hours ≈ 72 seconds) via the dashboard; wait for it to elapse; re-run the `curl` command above; confirm an OS-level "Fast complete" notification appears, and re-running the same `curl` again does **not** re-send it (verify via the Supabase MCP `execute_sql` tool that `fasting_logs.target_notified_at` is now set for that row).

- [ ] **Step 7: Commit**

```bash
git add utils/supabase/admin.ts "app/api/cron/notifications/route.ts" vercel.json
git commit -m "feat: add cron route to send push notifications on a schedule"
```

(`.env.local` is git-ignored — verify with `git status` that it doesn't appear in the diff before committing.)

---

## Self-Review

- **Spec coverage:**
  - Data model (`push_subscriptions`, `profiles`, `fasting_logs` columns) → Task 1.
  - Opt-in flow (Settings toggle, subscribe/unsubscribe, service worker registration) → Tasks 4, 5, 6.
  - Sending logic (all four triggers, dedup via `_notified_at` columns and time-window matching, `web-push`, dead-subscription cleanup) → Tasks 2, 3, 7.
  - Service worker `push`/`notificationclick` behavior → Task 5.
  - Removing the dead `Notification.requestPermission()` call → Task 6, Step 1.
- **Placeholder scan:** none — every step has complete, runnable code; no "TBD" or "similar to Task N" references.
- **Type consistency:**
  - `PushSubscriptionRecord { endpoint, p256dh, auth }` (Task 3) matches the flat shape selected from `push_subscriptions` in Task 7's `send()` closure.
  - `PushSubscriptionInput { endpoint, keys: { p256dh, auth } }` (Task 4, browser `PushSubscription.toJSON()` shape) is intentionally a different, nested shape from `PushSubscriptionRecord` — Task 6's `handleEnableNotifications` constructs the nested shape when calling `subscribeToPush`, never mixing the two.
  - `FastProgress` (Task 2) fields (`elapsedMinutes`, `targetDurationHours`, `targetNotifiedAt`, `reminderNotifiedAt`) match exactly what Task 7 constructs from the `fasting_logs` query result.
  - `sendPush`'s return type (`{ delivered: true } | { delivered: false; expired: boolean }`) is checked correctly in Task 7 (`if (!result.delivered && result.expired)`).
