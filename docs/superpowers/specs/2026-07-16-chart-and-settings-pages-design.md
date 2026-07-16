# Stats and Settings Pages

## Problem

The bottom nav (`components/layout/BottomNav.tsx`) already has "Stats" and "Settings" tabs, but both are disabled placeholders pointing at `/dashboard`. Neither page exists. Meanwhile:

- `profiles` already has `min_fasting_threshold_minutes` and `reminder_offset_minutes` columns that nothing reads or writes.
- `lib/fasting.ts`'s `computeStopOutcome` hardcodes `thresholdMinutes = 5` instead of using the user's `min_fasting_threshold_minutes`.
- `health_logs` (water/weight/mood/note) exists in Supabase with 7 rows but no app code reads or writes it.
- A public `avatars` storage bucket exists but nothing uploads to it; `profiles.avatar_url` is unused.

This spec builds both pages and wires up the profile columns that already exist for this purpose.

## Goals

- A working Stats page: weight trend chart + fasting duration/streak trends.
- A working Settings page: profile info (name, birth date, avatar), fasting preferences (threshold, reminder offset, weight unit), sign out.
- `min_fasting_threshold_minutes` actually drives stop-fast behavior instead of the hardcoded `5`.
- Both nav items flip from disabled to enabled, linking to real routes.

## Non-goals

- **Real push notifications.** `reminder_offset_minutes` is stored and editable in Settings but nothing sends a notification yet — that's a separate subsystem (service worker, browser permission flow, VAPID/web-push, scheduling) deserving its own design. Out of scope here.
- **Account deletion.** Settings' account section is sign-out only.
- Water intake and mood/notes tracking (other `health_logs` types) — only `weight` is used in this pass.

## Architecture

Both pages follow the existing server-page + client-component split already used by `history/page.tsx` / `HistoryClient.tsx` and `dashboard/page.tsx` / `DashboardClient.tsx`.

- **`app/(app)/stats/page.tsx`**: authenticates (redirect to `/login` if no user, matching `history/page.tsx`), fetches:
  - `fasting_logs` for the current user, non-ongoing, ordered by `start_time` desc (same query shape as `history/page.tsx`).
  - `health_logs` for the current user where `log_type = 'weight'`, ordered by `created_at` asc.
  - `profiles.weight_unit` for display formatting.
  - Passes all three to `StatsClient.tsx`.
- **`app/(app)/settings/page.tsx`**: authenticates, fetches the full `profiles` row for the current user (same query as `dashboard/page.tsx`), passes to `SettingsClient.tsx`.
- **`components/layout/BottomNav.tsx`**: `Stats` and `Settings` entries become `enabled: true`, with `href: '/stats'` and `href: '/settings'` respectively.

No changes to `app/(app)/layout.tsx`, middleware, or auth flow.

## Data model changes

One migration on the `sishawogcismoegecigd` Supabase project:

```sql
alter table public.profiles
  add column weight_unit text not null default 'kg'
  check (weight_unit in ('kg', 'lb'));
```

`min_fasting_threshold_minutes` and `reminder_offset_minutes` already exist and need no schema change — only new consuming code.

## Stats page (`StatsClient.tsx`)

**Weight section:**
- Custom SVG line chart (no new chart dependency — hand-built to match `FastingClock`'s framer-motion animation style), plotting weight entries over time. Values are stored in `health_logs.value` (text) in the unit active at the time of logging; displayed converted to the user's current `weight_unit` preference.
- Empty state when no weight logs exist: message + "Add weight" call to action.
- "Add weight" button opens the existing `Modal` component with a numeric input (unit label shown matches `profiles.weight_unit`). Submits via new server action:
  - `app/actions/health.ts::logWeight(value: number)` — inserts into `health_logs` with `log_type: 'weight'`, `value: String(value)`. Reads the user's current `weight_unit` server-side (via `profiles`) so the stored value's unit is unambiguous; no unit is stored per-row, so **a unit change in Settings converts existing history for display** (see Unit conversion below), not by rewriting stored rows.

**Unit conversion:** a pure helper in `lib/units.ts`:
```ts
function kgToLb(kg: number): number
function lbToKg(lb: number): number
```
Since raw `health_logs.value` has no stored unit, weight entries are interpreted as having been logged in whatever `profiles.weight_unit` is *at read time* — this is a known simplification: if a user changes their unit preference, their historical entries are reinterpreted (not converted) under the new unit. This is acceptable because the target user base logs consistently and unit changes are rare; flagged here so it's a deliberate choice, not an oversight.

**Fasting trends section:**
- Small stat row: current streak (consecutive completed fasts ending today or yesterday) and completion rate over the last 30 days (`completed` count / total non-ongoing count in range).
- Custom SVG bar chart: one bar per recent fast, height = actual duration, with a reference line at the target duration, reusing the `fasting_logs` fetch from the page.
- Pure calculation helpers (`getCurrentStreak`, `getCompletionRate`) added to `lib/fasting.ts`, unit-tested like `computeStopOutcome`.

## Settings page (`SettingsClient.tsx`)

- **Profile section**: full name (text input), birth date (date input). Avatar: tapping the current avatar (or initials fallback, matching `DashboardClient`'s `firstName` pattern) opens a file picker; on selection, uploads to the `avatars` bucket under a path scoped to the user's id, then updates `profiles.avatar_url` to the resulting public URL.
- **Preferences section**: minimum fasting threshold (number input, minutes), reminder offset (number input, minutes — stored only, not consumed yet), weight unit (kg/lb toggle).
- **Account section**: "Sign out" button — `supabase.auth.signOut()` then redirect to `/login`.
- All field saves (except avatar, which uploads immediately on selection) go through one new server action `app/actions/profile.ts::updateProfile(fields: Partial<ProfileFields>)`, following the `{ error }` / `{ success: true, data }` return convention used by `app/actions/fasting.ts`.

## Wiring the fasting threshold

`app/(app)/dashboard/page.tsx` already fetches `profiles` — extend the query to include `min_fasting_threshold_minutes` and pass it through `DashboardClient`'s `initialProfile` prop. `DashboardClient.handleConfirm` passes it as `computeStopOutcome`'s 4th argument instead of relying on the default of `5`.

## Error handling

Matches existing conventions:
- Server actions return `{ error: string }` on failure; client components show inline error text (as `DashboardClient.confirmError` does today).
- Avatar upload: on upload failure, show inline error in the Settings profile section; `profiles.avatar_url` is only updated after a successful upload (no partial/broken state).
- Weight log insert failure: inline error in the Add Weight modal, modal stays open so the value isn't lost.

## Testing

- `lib/units.ts`: unit tests for `kgToLb`/`lbToKg` round-tripping and known reference values.
- `lib/fasting.ts` additions (`getCurrentStreak`, `getCompletionRate`): unit tests following `lib/fasting.test.ts`'s existing style (empty history, all-completed, mixed, boundary dates).
- `computeStopOutcome` threshold wiring: existing tests already cover custom-threshold behavior; add a note/no new test needed since the function itself is unchanged, only its caller.
- No new e2e/browser test infra — manual verification of both pages in the running app (add a weight entry, confirm chart renders and unit toggle updates display; change threshold in Settings, confirm a fast stopped early now respects the new value).
