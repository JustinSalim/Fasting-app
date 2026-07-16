# Push Notifications & Weight Chart Tap-Detail

## Problem

Two independent gaps:

1. **Notifications are fake.** The dashboard's bell (`app/(app)/dashboard/DashboardClient.tsx:122-123`) always shows an empty state — nothing ever populates it. `FastingContext.tsx:40-42` calls `Notification.requestPermission()` when a fast starts, but nothing is ever sent through that permission. `profiles.reminder_offset_minutes` is stored and editable in Settings but unused. The earlier stats/settings design explicitly called this out as a separate subsystem deserving its own design (`docs/superpowers/specs/2026-07-16-chart-and-settings-pages-design.md`, Non-goals).
2. **The weight chart (`components/stats/WeightChart.tsx`) is display-only.** Points are plotted but not interactive — there's no way to see the exact gain/loss at a given point without doing the math by eye.

## Goals

- Real, working push notifications (survive the tab/app being closed) for four triggers: fast-goal-reached, pre-goal reminder, daily streak nudge, daily weight-log nudge.
- Users opt in via a new Notifications section in Settings, with a configurable daily reminder time.
- Tapping a point on the weight chart shows that entry's date, weight, and change vs. the previous entry.

## Non-goals

- An in-app notification history/feed — the dashboard bell stays a placeholder empty state. These are OS-level pushes, not an in-app log.
- A recurring "eating window" schedule concept (e.g. "remind me to start a fast at 8pm daily") — fasts stay ad-hoc; the only pre-goal reminder is relative to an *already-started* fast's target, via the existing `reminder_offset_minutes`.
- Per-category notification toggles — one master "enable notifications" switch controls all four triggers.
- Color-coding the weight delta as good/bad — the app doesn't know if the user's goal is to gain or lose weight.

## Architecture — Push notifications

### Data model

New table:

```sql
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
```

New `profiles` columns:

```sql
alter table public.profiles
  add column notifications_enabled boolean not null default false,
  add column timezone text,
  add column daily_reminder_time text;
```

New `fasting_logs` columns (make each threshold-crossing notification fire exactly once, since the cron re-evaluates every ongoing fast on every tick):

```sql
alter table public.fasting_logs
  add column target_notified_at timestamptz,
  add column reminder_notified_at timestamptz;
```

`reminder_offset_minutes` (already on `profiles`) is reused as-is for the pre-goal reminder — no change needed there.

### Opt-in flow (Settings)

New "Notifications" `AccordionSection` in `SettingsClient.tsx`:
- Toggle: "Enable notifications"
- `<input type="time">` for `daily_reminder_time`, shown once enabled

On enable:
1. Register `public/sw.js`.
2. `Notification.requestPermission()` — denied → inline error, toggle stays off.
3. `registration.pushManager.subscribe({ applicationServerKey: VAPID_PUBLIC_KEY })`.
4. POST the subscription to `/api/push/subscribe`, which upserts `push_subscriptions` (by `endpoint`) for the current user.
5. Extend `updateProfile`'s allow-list with `notifications_enabled`, `timezone` (`Intl.DateTimeFormat().resolvedOptions().timeZone`), `daily_reminder_time`.

On disable: unsubscribe the browser's `PushSubscription`, POST to `/api/push/unsubscribe`, set `notifications_enabled: false`.

Cleanup: remove the dead `Notification.requestPermission()` call in `FastingContext.tsx:40-42` — opt-in now lives entirely in Settings.

### Sending logic (Vercel Cron)

`vercel.json` schedules `GET /api/cron/notifications` every 15 minutes (`*/15 * * * *`). The route checks a `CRON_SECRET` bearer token before doing anything.

> Deployment prerequisite: frequent Vercel Cron schedules require a Pro plan (Hobby is limited to daily runs). Not a code blocker, but needed before this ships to production.

Each tick, for every `profiles` row with `notifications_enabled = true`:

1. **Goal reached** — ongoing `fasting_logs` where `elapsed_minutes >= target_duration_hours * 60` and `target_notified_at is null`: send "Fast complete" push, stamp `target_notified_at`.
2. **Pre-goal reminder** — ongoing `fasting_logs` where `elapsed_minutes >= target_duration_hours * 60 - reminder_offset_minutes`, `reminder_notified_at is null`, and not already target-notified: send "Almost there" push, stamp `reminder_notified_at`.
3. **Streak nudge** — no ongoing fast, no `fasting_logs` row started "today" in the user's `timezone`, and `daily_reminder_time` falls within this tick's window (previous tick time, now] converted to the user's local time: send "Don't lose your streak" push.
4. **Weight nudge** — no `health_logs` row with `log_type = 'weight'` for "today" in the user's timezone, same time-window check: send "Log today's weight" push.

Steps 3/4 use a time-window match rather than a persisted "already sent" flag — a missed tick just skips that day's nudge, which is acceptable for a reminder (not a correctness-critical path).

Sending uses the `web-push` npm package (new dependency — VAPID signing/encryption isn't worth hand-rolling) with `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` env vars. A `410`/`404` response from the push service means the subscription is dead — delete that `push_subscriptions` row inline.

### Service worker (`public/sw.js`)

- `push` event → `self.registration.showNotification(title, { body })`.
- `notificationclick` → focus an existing tab or open the app; fasting-related pushes go to `/dashboard`, the weight nudge goes to `/stats`.

## Architecture — Weight chart tap-detail

All changes contained in `components/stats/WeightChart.tsx`, no new dependency:

- Each plotted point gets a larger invisible touch target (`r=10` transparent circle layered over the existing `r=3` visible dot).
- `onClick` sets a `selectedIndex` state; tapping the same point again, or tapping the chart background, clears it.
- A floating tooltip (absolutely-positioned div anchored to the selected point's `x`/`y`, clamped within the card) shows:
  - Date (`d MMM`)
  - Weight + unit
  - Delta vs. the previous entry (e.g. `-0.4 kg` / `+0.4 kg`), neutral-colored. The first entry has no previous point, so it shows date + weight only.

## Error handling

- Push subscribe/unsubscribe failures (permission denied, `pushManager.subscribe` rejecting) surface as an inline error in Settings; `notifications_enabled` is only set true after a successful subscribe round-trip.
- Cron route: any unauthenticated request (missing/wrong `CRON_SECRET`) returns 401 and does nothing.
- Per-subscription send failures don't abort the batch — each subscription is sent independently; a `410`/`404` deletes that row, other errors are logged and skipped.

## Testing

- Unit tests for the cron route's pure trigger logic (goal-reached / pre-goal / streak / weight window checks) given fixed "now" + fixture rows — the part with real branching logic worth pinning down.
- Unit test for `WeightChart`'s delta calculation (previous-entry diff, first-entry-has-no-delta case).
- No test for the service worker or actual push delivery — that's platform behavior, exercised manually (subscribe in a real browser, trigger each condition, confirm the OS notification appears).
