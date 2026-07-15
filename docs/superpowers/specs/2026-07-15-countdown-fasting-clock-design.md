# Countdown Fasting Clock

## Problem

The main fasting clock (`components/fasting/ElapsedClock.tsx`) currently counts up from the fast's start time (`00:00:00`, `00:00:01`, ...). We want it to count down toward the user's goal duration instead, since the app already collects a target duration per fast (`DurationSelector`, `targetDuration` in `FastingContext`) but never uses it for the live clock display.

## Goals

- Clock shows time remaining until the fast's goal duration is reached, ticking down every second.
- Once the goal is reached (remaining hits zero), the clock flips to counting up as "overtime" past the goal, with a visual cue that the goal was hit.
- Fully replaces the count-up display — no toggle between modes.
- No change to the "READY TO FAST" idle state, the FASTING/FAT BURNING stage badge, or stop-fast completed/missed logic.

## Design

### Data flow

`ElapsedClock` gains a new required prop `targetDuration: number | null`, sourced from `useFasting()` in `DashboardClient.tsx` (the context already exposes this value; it's just not passed down today).

### Countdown calculation

New pure helper added to `lib/fasting.ts`, alongside `formatElapsed`/`getFastingStage`, and covered by a unit test in `lib/fasting.test.ts`:

```ts
function getRemainingSeconds(targetHours: number, elapsedSeconds: number): number {
  return targetHours * 3600 - elapsedSeconds
}
```

Elapsed seconds continue to be computed exactly as today (`differenceInSeconds(new Date(), startTime)` on a 1s `setInterval`) — only the *display* changes.

### Display logic

In the renamed clock component:

- `remaining = getRemainingSeconds(targetDuration, elapsedSeconds)`
- If `remaining >= 0`: render `formatElapsed(remaining)`, `text-primary` (unchanged visual style from today).
- If `remaining < 0`: goal has been reached.
  - Render `+` + `formatElapsed(-remaining)` (counts up from `+00:00:00`).
  - Switch clock digit color from `text-primary` to `text-secondary` — reusing the existing green already used for the "FAT BURNING" badge, so overtime reads as a positive/achieved state rather than an alarming one.
- If `isFasting` is true but `targetDuration` is `null` (defensive — shouldn't happen in practice since `DurationSelector` always sets a target before `startFast` is called, but the prop type allows it): fall back to plain elapsed count-up, matching today's behavior. This avoids a crash/NaN display if the type's nullability is ever actually hit.
- Idle state (`!isFasting`) is unchanged: clock shows `00:00:00`.

### Component rename

`ElapsedClock.tsx` → `FastingClock.tsx`, component `ElapsedClock` → `FastingClock`. The name "elapsed" is no longer accurate since the primary display is a countdown. The single consumer (`app/(app)/dashboard/DashboardClient.tsx`) is updated accordingly.

`formatElapsed` and `getFastingStage` in `lib/fasting.ts` keep their current names — they still operate on elapsed seconds/hours internally, which is accurate; only how the component displays that elapsed value changes.

### Explicitly unaffected

- `getFastingStage` (FASTING / FAT BURNING badge) — still keyed off elapsed hours, untouched.
- `computeStopOutcome` (completed vs. missed classification on stop) — untouched, still compares elapsed minutes to goal.
- `DurationSelector`, `FastingContext`, server actions — untouched.

## Testing

- Unit test `getRemainingSeconds` in `lib/fasting.test.ts` (positive remaining, exact zero, negative/overtime cases), following the existing test patterns for `formatElapsed`/`getFastingStage`/`computeStopOutcome`.
- Manual verification in the running app: start a fast, confirm the clock counts down; verify (via a short target duration, e.g. custom 1-minute-equivalent or by manipulating system time if needed) that it flips to `+` overtime in secondary color once the goal passes.
