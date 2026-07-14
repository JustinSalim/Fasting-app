# Antigravity Fasting Tracker V2 — MVP Design (Auth + Timer)

## Context

`fasting` (v1, at `Desktop/1. Programming/NextJS/fasting`) is a working intermittent-fasting
PWA: Supabase auth, DB-synced fasting sessions, notification scheduling, health logs,
analytics, PWA manifest/service worker, deployed to Vercel. It has ~19 commits of real bug
fixes (timezone handling, auth resend logic, duration thresholds, optimistic updates).

V2 ("Antigravity") is a visual and structural rebuild in `fastingv2` using a new design
system (see Stitch mockups at `Desktop/project-brief/stitch_antigravity_fasting_tracker/`
and its `antigravity/DESIGN.md` token spec). This is a rebuild, not a restyle-in-place: code
is written fresh in `fastingv2`, but v1's proven logic (data model, auth flow, timer state
machine, threshold math) is used as a direct reference rather than re-derived from scratch.

This spec covers the **first phase only**: foundation, auth/onboarding, and the core fasting
timer. Analytics ("Your Journey") and Reminders (scheduled push notifications) are separate
follow-up phases, each to get its own brainstorm/spec.

## Goals

- A deployable-quality Next.js app in `fastingv2` where a user can sign up, verify their
  email, log in, start a fast with a preset or custom duration, watch a live countdown, and
  stop the fast — all persisted to Supabase and styled per the Antigravity design system.
- Reuse the existing Supabase project (same URL/keys, same `profiles` + `fasting_logs`
  tables) so v1 and v2 share one source of truth for users and fast history during the
  transition.

## Non-goals (explicitly out of scope for this phase)

- Your Journey: streak calendar, weekly stats, trend cards.
- Reminders: scheduled push notifications before a fast ends (browser `Notification`
  permission is still requested on fast start, but no scheduling logic ships yet).
- Health logs (water/weight tracking).
- Avatar/profile photo upload.
- Forgot-password flow (v1 doesn't have one either — parity, not a gap).
- Production deployment / Vercel setup.
- Automated E2E or component tests (flagged as a gap, not solved here).

## Architecture

- **Stack**: Next.js 16 (App Router), `@supabase/ssr` + `@supabase/supabase-js`, Tailwind CSS
  4, framer-motion, date-fns, next-themes, lucide-react. Matches v1's stack exactly —
  already proven, and `fastingv2` was scaffolded with Tailwind 4.
- **Supabase project**: same project as v1. Copy `.env.local` (URL + anon key) from v1 into
  `fastingv2`. Reuse the existing `profiles` and `fasting_logs` tables — no new migrations
  needed for this phase.
- **Session/auth plumbing**: port `utils/supabase/client.ts`, `utils/supabase/server.ts`, and
  the session-refresh middleware (`proxy.ts` in v1 — already fixed for Next 16 compatibility)
  directly from v1.
- **Data flow**: the dashboard is a Server Component that fetches the current profile and any
  `ongoing` `fasting_logs` row server-side, then passes it as `initialFast` into a client
  `FastingProvider` context (same shape as v1's `FastingContext.tsx`: `isFasting`,
  `startTime`, `targetDuration`, `activeFastId`, `startFast`, `stopFast`). The live countdown
  ticks client-side via `setInterval` computed from `startTime`/`targetDuration` — no
  polling.
- **Mutations**: Server Actions (`app/actions/fasting.ts`, ported/adapted from v1) handle
  starting and stopping a fast, writing to `fasting_logs`.

## Design system integration

- Port the token set from `antigravity/DESIGN.md` into `tailwind.config.ts`: the full color
  palette (surface/primary/secondary/tertiary + containers, matching Material-3-style
  naming), typography scale (`display-clock`, `headline-lg`, `headline-lg-mobile`,
  `body-md`, `label-caps` — Outfit / Plus Jakarta Sans / Space Grotesk from Google Fonts),
  border radii, and spacing tokens (`container-margin`, `stack-gap`, `section-padding`,
  `inner-padding`).
- Add the signature `ambient-shadow` utility (`0 20px 50px -10px rgba(0,0,0,0.03)`) and the
  `float`/`pulse-glow` animations used on the timer centerpiece and primary action button.
- Dark mode via `next-themes` + Tailwind `class` strategy (not separate light/dark HTML
  files as Stitch exported them) — one component tree, `dark:` variants throughout.
- Adapt markup directly from the Stitch-generated `code.html` for `fasting_timer` and
  `join_antigravity` (light + dark) into React/TSX, replacing static content with live data.
- **Icon library**: use `lucide-react` (already a v1 dependency, no extra font-icon CDN)
  instead of the Material Symbols font the Stitch mockups reference. Visually close but not
  pixel-identical to the mockups — accepted tradeoff for one fewer external font dependency.
- **Bottom nav**: renders all three tabs (Home / Stats / Settings) per the mockup for visual
  completeness, but Stats and Settings are dimmed, non-navigating stubs this phase (not
  broken links, not omitted).

## Flows

### Auth / onboarding
1. Sign up with email + password → Supabase sends verification email → UI shows a "check
   your email" success state (per the Stitch `join_antigravity` screen).
2. Email link hits the callback route (ported from v1's `app/auth/callback`) → session
   established → redirect to dashboard.
3. Log in with email + password (no forgot-password, matching v1).
4. Dashboard header greets "Hi, {first name}" — first token of `profiles.full_name`, same
   as v1's "prioritize first name" fix.

### Fasting timer
1. Duration selector: presets **2H / 4H / 6H / 8H** + **Custom** (numeric input, 1–72h,
   minimum enforced) — ported from v1's `DurationSelector.tsx` behavior, restyled with
   Antigravity tokens (pill buttons, animated selection indicator).
2. "Start Fasting": Server Action inserts a `fasting_logs` row (`status: ongoing`),
   optimistically updates local context state immediately (rollback + inline retry affordance
   if the write fails, mirroring v1's optimistic health-log pattern), and requests browser
   `Notification` permission (permission prompt only — no scheduling logic yet).
3. Live view: ultra-thin `display-clock` typography (Outfit 200, 80px) showing elapsed time,
   ticking every second; a status chip beneath switches copy/color (e.g. "FAT BURNING" in
   Olive) based on elapsed-time thresholds, reusing v1's threshold logic where present.
4. "Stop Fasting": Server Action sets `end_time` and computes `status`
   (`completed`/`partial`/`missed`) from percent of target duration reached, reusing v1's
   status math.
5. Session expiry mid-fast: middleware redirects to login; no state is lost because the
   active fast lives in `fasting_logs`, not client memory — re-login restores the live
   countdown from the DB.

## Error handling

- Auth errors (invalid credentials, unverified email) surface inline near the form — no
  `alert()` popups, consistent with the "frictionless" design tone.
- Start/stop fast failures: optimistic UI update rolls back and shows an inline retry
  affordance if the Server Action fails.
- Network/session issues follow existing Next.js/Supabase middleware redirect behavior.

## Testing

No test suite exists in v1. Add Vitest for the pure logic only:
- Duration/status math (completed vs. partial vs. missed thresholds).
- Elapsed-time formatting for the live clock.

E2E/component testing is out of scope for this phase — flagged as a known gap, not solved
here.

## Open questions / accepted tradeoffs

- Icon fidelity: `lucide-react` vs. Material Symbols (see Design system integration above)
  — accepted in favor of fewer dependencies.
- Nav stubs for Stats/Settings are placeholders, not real routes, until their own phases.
