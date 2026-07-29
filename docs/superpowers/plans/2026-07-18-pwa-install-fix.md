# PWA Install Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing PWA actually installable — fix missing manifest icons, register the service worker globally instead of only behind the push-notification opt-in, add iOS install meta tags, and deploy to production.

**Architecture:** Generate the two PNG icons the manifest already references (using macOS `sips` to rasterize a hand-written SVG — no new dependency). Add a tiny client component that registers `/sw.js` on mount, mounted once from the root layout. Extend the root layout's `metadata` export with `appleWebApp` fields and an apple-touch-icon link. Ship by pushing to `main` (Vercel auto-deploys the linked project).

**Tech Stack:** Next.js 16 App Router, existing `public/manifest.json` + `public/sw.js`, macOS `sips` CLI (no new npm dependency).

## Global Constraints

- Icon colors must match the existing palette: background `#F6F4F0`, accent `#FFB84C` (from `public/manifest.json`).
- Icon files must be named exactly `public/icon-192x192.png` and `public/icon-512x512.png` (already referenced by `public/manifest.json:11,16` — do not change the manifest).
- Do not modify `app/(app)/settings/SettingsClient.tsx`'s existing `navigator.serviceWorker.register('/sw.js')` call — registering the same SW URL twice is a harmless no-op in the browser, and that flow's push-subscription logic must keep working unchanged.
- No new npm dependencies.

---

### Task 1: Generate manifest icons

**Files:**
- Create: `public/icon-source.svg` (kept in repo as the editable source for future re-exports)
- Create: `public/icon-192x192.png`
- Create: `public/icon-512x512.png`

**Interfaces:**
- Produces: two PNG files at the exact paths `public/manifest.json` already references (`public/manifest.json:11` and `public/manifest.json:16`). No code depends on this task; Task 3 (manual verification) checks these render.

- [ ] **Step 1: Write the source SVG**

Create `public/icon-source.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#F6F4F0"/>
  <circle cx="256" cy="256" r="180" fill="none" stroke="#FFB84C" stroke-width="28"/>
  <line x1="256" y1="256" x2="256" y2="140" stroke="#FFB84C" stroke-width="20" stroke-linecap="round"/>
  <line x1="256" y1="256" x2="340" y2="256" stroke="#FFB84C" stroke-width="20" stroke-linecap="round"/>
</svg>
```

This is a simple clock face (fasting-timer motif) in the app's existing amber-on-cream palette.

- [ ] **Step 2: Rasterize to both required PNG sizes**

Run:
```bash
sips -s format png -Z 512 public/icon-source.svg --out public/icon-512x512.png
sips -s format png -Z 192 public/icon-source.svg --out public/icon-192x192.png
```

Expected: both commands print a summary line ending in the output path, no errors.

- [ ] **Step 3: Verify the PNGs are valid and correctly sized**

Run:
```bash
file public/icon-192x192.png public/icon-512x512.png
```

Expected output:
```
public/icon-192x192.png: PNG image data, 192 x 192, 8-bit/color RGBA, non-interlaced
public/icon-512x512.png: PNG image data, 512 x 512, 8-bit/color RGBA, non-interlaced
```

- [ ] **Step 4: Commit**

```bash
git add public/icon-source.svg public/icon-192x192.png public/icon-512x512.png
git commit -m "feat: add PWA manifest icons"
```

---

### Task 2: Register service worker globally and add iOS install meta tags

**Files:**
- Create: `app/ServiceWorkerRegistration.tsx`
- Modify: `app/layout.tsx`

**Interfaces:**
- Produces: `ServiceWorkerRegistration` — a default-exported client component with no props, side-effect-only (registers `/sw.js` on mount). Rendered once inside `RootLayout` in `app/layout.tsx`.
- Consumes: none (no dependency on Task 1's icon files — the manifest already points at those paths).

- [ ] **Step 1: Create the service worker registration component**

Create `app/ServiceWorkerRegistration.tsx`:

```tsx
'use client'

import { useEffect } from 'react'

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Install prompt eligibility just won't be met; nothing user-facing to show here.
    })
  }, [])

  return null
}
```

- [ ] **Step 2: Mount it in the root layout and add iOS metadata**

In `app/layout.tsx`, add the import and update the `metadata` export:

```tsx
import ServiceWorkerRegistration from "./ServiceWorkerRegistration";
```

Replace the existing `metadata` export:

```tsx
export const metadata: Metadata = {
  title: "Fasting",
  description: "A weightless, mindful intermittent fasting tracker",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Fasting",
  },
  icons: {
    apple: "/icon-192x192.png",
  },
};
```

Then render the component inside `<body>`, alongside the existing `ThemeProvider`:

```tsx
      <body className="min-h-full flex flex-col font-body-md">
        <ServiceWorkerRegistration />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
```

- [ ] **Step 3: Verify the app builds**

Run:
```bash
npx next build
```

Expected: build completes with no type errors (exit code 0).

- [ ] **Step 4: Manually verify service worker registers on load**

Run:
```bash
npm run dev
```

Open `http://localhost:3000` in a browser, open DevTools → Application → Service Workers. Expected: a worker for `/sw.js` is listed as activated, without touching the Settings page. Stop the dev server after confirming (Ctrl+C).

- [ ] **Step 5: Commit**

```bash
git add app/ServiceWorkerRegistration.tsx app/layout.tsx
git commit -m "feat: register service worker globally and add iOS install metadata"
```

---

### Task 3: Deploy to production and verify install experience

**Files:**
- None (deployment + manual verification only)

**Interfaces:**
- Consumes: Task 1's icon files and Task 2's service worker registration, both already committed to `main`.

- [ ] **Step 1: Push to main**

```bash
git push origin main
```

Expected: push succeeds; Vercel's GitHub integration picks up the commit automatically (project is already linked per `.vercel/project.json`, projectName `fasting-app`).

- [ ] **Step 2: Wait for the Vercel deployment to finish**

Check deployment status:
```bash
npx vercel ls fasting-app --yes 2>&1 | head -5
```

Expected: the most recent deployment shows `● Ready` (or open the Vercel dashboard for the project if the CLI isn't authenticated locally).

- [ ] **Step 3: Verify the manifest and icons are live**

```bash
curl -s https://<production-domain>/manifest.json
curl -s -o /dev/null -w "%{http_code}\n" https://<production-domain>/icon-192x192.png
curl -s -o /dev/null -w "%{http_code}\n" https://<production-domain>/icon-512x512.png
```

(Substitute the actual production domain from the Vercel dashboard or `vercel ls` output.)

Expected: manifest JSON returned, and both icon requests return `200`.

- [ ] **Step 4: Verify install prompt in a real browser**

Open the production URL in Chrome (desktop or Android). Expected: an install icon appears in the address bar (desktop) or a native "Add to Home Screen" / "Install app" banner is available (Android). On iOS Safari, use Share → "Add to Home Screen" and confirm the app icon (not a screenshot) and app name "Fasting" appear correctly, and that opening it launches in standalone mode (no browser chrome).

- [ ] **Step 5: Record deployment as done**

No commit needed for this step — deployment and manual verification only. If any verification step in Task 3 fails, treat it as a new bug to debug rather than re-running this plan.
