# fastingv2

A fasting-tracker PWA. Next.js 16 (App Router) + Supabase (auth, Postgres, RLS) + web-push.

## Layout
- `app/actions/*` — server actions. Thin: auth-gate, then call into `lib/`.
- `lib/*` — pure logic (fasting/streak math, notification scheduling, units, weight). **This is where tests live** (`*.test.ts`, vitest). Put logic here, not in actions/components.
- `app/api/cron/notifications/route.ts` — the push + auto-stop cron endpoint. Driven by Supabase pg_cron (DB-only, not in this repo).
- `proxy.ts` — Next 16 middleware (renamed from `middleware.ts`). Refreshes the Supabase session. Load-bearing, not dead code.

## Non-obvious rules
- **Never trust the client clock.** Completion (`completed` vs `missed`) is always derived from server time against `start_time + target_duration_hours`. A skewed device clock made a 7h fast look like 16h. See `updateFastingLog` / `completeFastingLogAtTarget`.
- **`missed` vs `completed` on overdue fasts is deliberate, not a bug.** The cron sweep marks still-`ongoing` past-target fasts as `missed` (user abandoned it — never tapped stop). The client path writes `completed` (app open, actively finishing at target). Don't "fix" one to match the other — see the comment in the cron route.
- Streak/completion-rate helpers filter to `phase = 'fasting'` only; a completed eating window never counts as a fast.

## Commands
- `npx vitest run` — tests
- `npx tsc --noEmit` — typecheck
