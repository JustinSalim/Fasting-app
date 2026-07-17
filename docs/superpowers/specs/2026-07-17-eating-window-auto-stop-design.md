# Eating Window Auto-Stop — Design

## Problem

The fasting timer today only tracks a single fast with a `target_duration_hours`. Once the target is reached, `FastingClock` flips into an "overtime" display (`+HH:MM:SS`) and keeps counting indefinitely — there is no eating-window concept at all, and nothing ever auto-stops. Users following a fixed protocol (e.g. 16:8) have no way to get an eating window that closes itself at the duration they set, so the "8 hours" they intended is not what gets logged.

## Goals

- Let users opt into a full fasting/eating cycle: fast auto-completes at its target, and a separate eating-window phase can be started that also auto-completes at its own (independently configured) target.
- Logged history reflects the exact intended duration (pinned end_time), not whatever time the user happened to tap "stop."
- Auto-completion must be reliable even if the user's tab isn't open when the target passes (server-side cron backstop), not just a client-side tick.
- Opt-in only — existing users' behavior is unchanged unless they turn this on.

## Non-goals

- No automatic chaining (fast → eating → fast → …) with zero taps. Every phase transition after auto-complete requires the user to manually start the next phase.
- No changes to the core single-fast flow for users who don't enable this.

## Data model

**`fasting_logs`**: add `phase text not null default 'fasting'` (`'fasting' | 'eating'`). Existing rows backfill to `'fasting'`. A "cycle" is simply two adjacent rows (one of each phase) — there is no explicit link between them; the dashboard determines what to show next from the most recent row's phase + status.

**`profiles`**: add
- `eating_window_enabled boolean not null default false` — opt-in toggle
- `eating_window_hours numeric not null default 8` — independently configured, not derived from fasting duration

No new tables. `lib/fasting.ts` streak/completion-rate helpers (`getCurrentStreak`, `getCompletionRate`) filter to `phase = 'fasting'` rows only, so a completed eating window never counts as a "fast" in streak math.

## Behavior

### Starting a phase
`startFastingLog` gets a `phase: 'fasting' | 'eating'` param (defaults to `'fasting'` for back-compat). Marks any prior `ongoing` row for that user as `missed` (existing behavior, unchanged), inserts a new row with the given phase and its matching target duration (`target_duration_hours` for fasting, `eating_window_hours` for eating).

### Reaching target — client path
`FastingClock` already computes `remainingSeconds` every tick. When `eating_window_enabled` is true and `remainingSeconds` crosses to `<= 0`:
- Auto-call `updateFastingLog(id, 'completed')` with `end_time` pinned to `start_time + target_duration_hours` (not `now`), so the logged duration is exactly the intended one regardless of tick drift.
- The phase does **not** auto-start the next phase. The clock moves to a "phase complete, ready to start next" state; the dashboard shows a manual "Start Eating Window" (after fasting) or "Start Fast" (after eating) button.
- On reopen after the tab was closed past target: `FastingContext`'s existing re-sync-from-server-prop logic naturally picks up whatever state the server/cron has already corrected to — no new resync logic needed.

### Reaching target — server path (cron backstop)
Extend `app/api/cron/notifications/route.ts`: for profiles with `eating_window_enabled = true`, also select `fasting_logs` where `status = 'ongoing'` and `now >= start_time + target_duration_hours` (either phase), and force-complete them the same way (`status = 'completed'`, `end_time` pinned to `start_time + target_duration_hours`). New pure function `getOverdueOngoingLogs` in `lib/notifications.ts` alongside the existing `shouldSendGoalReached`/`shouldSendPreGoalReminder`, following the same dedupe-by-timestamp-column pattern used elsewhere in that file. This guarantees history is accurate even if the user never reopens the app before the next phase would have started.

### Settings UI
New `AccordionSection` "Eating Window" in `SettingsClient.tsx`:
- Segmented-control (existing on/off pattern) for `eating_window_enabled`.
- When on, reveal a numeric input (existing numeric-setting pattern) for `eating_window_hours`.
- Saved via `updateProfile` server action, extended with the two new fields.

### Dashboard UI
`FastingClock` gains a `phase: 'fasting' | 'eating' | null` prop:
- `'eating'`: swap label to "EATING WINDOW", swap the flame badge/accent color to a distinct one, keep identical ring/countdown mechanics.
- Overtime display is removed for users with `eating_window_enabled` on — once target is reached the auto-complete path takes over before overtime can render.

Dashboard page adds a manual "Start Eating Window" / "Start Fast" CTA shown when the current phase is complete and no phase is `ongoing`, calling `startFastingLog(hours, phase)`.

## Testing

- `lib/fasting.ts`: unit tests for phase-filtered streak/completion-rate.
- `lib/notifications.ts`: unit tests for `getOverdueOngoingLogs` (boundary at exactly target, before target, already-completed rows excluded).
- Manual: enable toggle, run a short fast (small target) to verify client auto-complete pins end_time correctly and shows the manual-start CTA; verify cron backstop by manually expiring a row's start_time and invoking the cron route.
