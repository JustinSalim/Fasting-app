# Weight Chart Tap-Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tapping a point on the weight chart shows that entry's date, weight, and change vs. the previous entry.

**Architecture:** A pure `getWeightDelta` helper (matching the existing `lib/*.ts` + `lib/*.test.ts` convention used by `lib/units.ts` and `lib/fasting.ts`) computes the delta. `WeightChart.tsx` adds local `selectedIndex` state, a larger invisible touch target per point, and an absolutely-positioned tooltip anchored to the selected point.

**Tech Stack:** React 19, TypeScript, vitest (node environment, no DOM/testing-library — this codebase only unit-tests pure logic, never components; see `lib/units.test.ts`).

## Global Constraints

- No new npm dependency — plain SVG + React state, matching how `WeightChart.tsx` is already built.
- Delta is neutral-colored, never red/green — the app doesn't know if the user's goal is to gain or lose weight (spec: `docs/superpowers/specs/2026-07-16-push-notifications-and-weight-detail-design.md`, Non-goals).
- Design tokens only — no raw hex colors or arbitrary Tailwind values; reuse existing classes (`bg-surface-container-high`, `text-on-surface`, `shadow-float`, etc.) as seen elsewhere in `components/stats/` and `components/settings/`.
- Reference spec: `docs/superpowers/specs/2026-07-16-push-notifications-and-weight-detail-design.md` (Weight chart tap-detail section).

---

### Task 1: `getWeightDelta` helper

**Files:**
- Create: `lib/weight.ts`
- Test: `lib/weight.test.ts`

**Interfaces:**
- Produces: `getWeightDelta(entries: { value: number }[], index: number): number | null` — consumed by Task 2.

- [ ] **Step 1: Write the failing test**

Create `lib/weight.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { getWeightDelta } from './weight'

describe('getWeightDelta', () => {
  it('returns null for the first entry (no previous)', () => {
    expect(getWeightDelta([{ value: 80 }, { value: 79 }], 0)).toBeNull()
  })

  it('returns the difference vs. the previous entry', () => {
    expect(getWeightDelta([{ value: 80 }, { value: 79.5 }], 1)).toBeCloseTo(-0.5, 5)
  })

  it('returns a positive delta on a gain', () => {
    expect(getWeightDelta([{ value: 80 }, { value: 81.2 }], 1)).toBeCloseTo(1.2, 5)
  })

  it('returns null for an out-of-range index', () => {
    expect(getWeightDelta([{ value: 80 }], 5)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/weight.test.ts`
Expected: FAIL — `Cannot find module './weight'` (file doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `lib/weight.ts`:
```ts
export function getWeightDelta(entries: { value: number }[], index: number): number | null {
  if (index <= 0 || index >= entries.length) return null
  return entries[index].value - entries[index - 1].value
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/weight.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/weight.ts lib/weight.test.ts
git commit -m "feat: add getWeightDelta helper for weight chart tap-detail"
```

---

### Task 2: Tap-to-select interaction and tooltip in `WeightChart.tsx`

**Files:**
- Modify: `components/stats/WeightChart.tsx`

**Interfaces:**
- Consumes: `getWeightDelta(entries: { value: number }[], index: number): number | null` from Task 1.

- [ ] **Step 1: Read the current file**

Read `components/stats/WeightChart.tsx` in full before editing — it's short (73 lines) and every line below depends on its exact current structure (the `points` array, the `<svg>` block, the existing `<circle>` render).

- [ ] **Step 2: Add selection state and import the helper**

In `components/stats/WeightChart.tsx`, add the import and state. Change:
```tsx
import { format, parseISO } from 'date-fns'
```
to:
```tsx
import { format, parseISO } from 'date-fns'
import { getWeightDelta } from '@/lib/weight'
```

Inside `WeightChart`, right after the `entries`/`values`/`min`/`max`/`range` declarations, add:
```tsx
const [selectedIndex, setSelectedIndex] = React.useState<number | null>(null)
```

- [ ] **Step 3: Compute the selected point and delta**

After the `first`/`last` declarations (`const first = entries[0]` / `const last = entries[entries.length - 1]`), add:
```tsx
const selected = selectedIndex !== null ? points[selectedIndex] : null
const delta = selectedIndex !== null ? getWeightDelta(entries, selectedIndex) : null
```

- [ ] **Step 4: Wrap the `<svg>` in a relative container, add touch targets, dismiss-on-background-tap**

Replace:
```tsx
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
```
with:
```tsx
      <div className="relative">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full h-auto overflow-visible"
          onClick={() => setSelectedIndex(null)}
        >
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
          {points.map((p, i) => (
            <g key={p.entry.id}>
              <circle cx={p.x} cy={p.y} r={3} className="fill-primary" />
              <circle
                cx={p.x}
                cy={p.y}
                r={10}
                fill="transparent"
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation()
                  setSelectedIndex((current) => (current === i ? null : i))
                }}
              />
            </g>
          ))}
        </svg>
        {selected && (
          <div
            className={`absolute -translate-y-full mb-2 pointer-events-none bg-surface-container-high text-on-surface rounded-xl px-3 py-2 shadow-float text-xs whitespace-nowrap ${
              selectedIndex === 0
                ? 'translate-x-0'
                : selectedIndex === entries.length - 1
                ? '-translate-x-full'
                : '-translate-x-1/2'
            }`}
            style={{
              left: `${(selected.x / WIDTH) * 100}%`,
              top: `${(selected.y / HEIGHT) * 100}%`,
            }}
          >
            <div className="font-semibold">{format(parseISO(selected.entry.created_at), 'd MMM')}</div>
            <div>
              {selected.entry.value.toFixed(1)} {unit}
              {delta !== null && ` (${delta >= 0 ? '+' : ''}${delta.toFixed(1)})`}
            </div>
          </div>
        )}
      </div>
```

Note: `mb-2` on the tooltip div has no effect on an absolutely-positioned element's own layout, but is harmless; the visual gap above the point comes from `-translate-y-full` alone. Remove `mb-2` if you want to keep the className strictly accurate — either way behavior is identical since it's `position: absolute`.

- [ ] **Step 5: Verify manually in the browser**

Run: `npm run dev`

Open `http://localhost:3000/stats` (log in first if needed — use the seeded demo account if one exists, or sign up). With at least 2 weight entries logged:
1. Tap a middle point → tooltip appears above it showing date, weight, and a signed delta.
2. Tap the same point again → tooltip disappears.
3. Tap a different point → tooltip moves to the new point.
4. Tap the first point → tooltip shows date + weight only, no delta (no previous entry to diff against).
5. Tap empty chart background → tooltip disappears.

Confirm no console errors in the browser devtools during this flow.

- [ ] **Step 6: Run the full test suite to check for regressions**

Run: `npx vitest run`
Expected: all existing tests still PASS, plus the 4 new `getWeightDelta` tests.

- [ ] **Step 7: Commit**

```bash
git add components/stats/WeightChart.tsx
git commit -m "feat: tap a weight chart point to see date, weight, and delta"
```

---

## Self-Review

- **Spec coverage:** "Tapping a point... shows date, weight, delta vs previous entry, neutral-colored, first point has no delta" — Task 1 (delta logic) + Task 2 (interaction/display) cover this fully.
- **Placeholder scan:** none — every step has complete, runnable code.
- **Type consistency:** `getWeightDelta(entries: { value: number }[], index: number): number | null` is identical between Task 1's definition and Task 2's usage; `WeightEntry` already has `.value: number`, so no type changes needed to the existing `WeightChart` props.
