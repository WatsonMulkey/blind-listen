# Final-Review Fix Wave — Report

Branch: `watson/monetization-experiment` (was HEAD `a6b73d1`). Fixes every
finding from the final whole-branch review, nothing else.

## 1. CRITICAL — Ref track plays through the timer-end gate

**File:** `js/timer.js`, `sessionTick()` 0:00 branch.

`pause()` → `stop()` only ever tore down `sourceNode` (the mix engine).
`playRef()` in `js/ui.js` sets `isPlaying = true` too but drives a wholly
separate source, `refSourceNode` — so a playing reference track kept
sounding straight through the gate.

Fix: added `stopRefSource();` (defined in `js/ui.js`, internally guarded —
no-op if nothing is playing) unconditionally alongside `if (isPlaying)
pause();` in the 0:00 branch:

```js
if (isPlaying) pause();
stopRefSource();
```

**Evidence:** `task-final-verification.mjs` scenario 1 — monkey-patches
`AudioBufferSourceNode.prototype.stop` to tag and log every real engine-level
`.stop()` call, plays a real ref track through a real (time-warped) 0:00 gate,
and confirms the specific ref source's `.stop()` actually fired, `refSourceNode`
is nulled, `isPlaying` is false, and no `gate_bypassed` telemetry fired as a
side effect. 8/8 PASS.

## 2. IMPORTANT — Mid-session Pro flip leaves the countdown running

**File:** `js/checkout.js`, `initEntitlementsOnLoad()`, both `currentTier =
'pro'` sites.

- Fresh-cache branch (~line 159): added `if (timerStarted)
  switchTimerToProMode();` right after the tier assignment. Belt-and-
  suspenders — this branch runs synchronously before a session can
  plausibly exist yet, but it's now consistent with the other site.
- Expired-cache-revalidated branch (~line 176, inside the `await fetch(...)`
  continuation): same guard added. **This is the real race** — the fetch
  round-trip gives the user time to click "Start listening" and have a
  countdown ticking before `currentTier` resolves to `'pro'`.

**Evidence:** `task-final-verification.mjs` scenario 2 — real free session
starts (no time-warp, real `FREE_SESSION_SECONDS`), a stubbed
`validate-license` response is deliberately delayed 2.5s so the countdown is
provably ticking (`sessionSeconds` observed dropping from 360) before the
revalidation resolves `{valid:true}` mid-session. Confirms: tier flips to
pro, `sessionSeconds` stops changing (old interval torn down, not left
running), `proElapsedSeconds` is actively incrementing across two 1.2s-apart
samples (not frozen), aria-label and CSS classes hand off correctly. 9/9
PASS.

## 3. IMPORTANT — API_BASE hardcoded to production breaks preview-deploy E2E

**File:** `js/config.js`.

Replaced the hardcoded absolute constant with an origin-aware ternary:

```js
const API_BASE = location.hostname === 'foil.engineering'
  ? 'https://blind-listen.vercel.app/api'
  : '/api';
```

Only `foil.engineering` needs the absolute URL (the Vercel rewrite proxy
covers page routes but not `/api`); every other origin — production
`blind-listen.vercel.app` and every preview deploy alike — uses the relative,
same-origin `/api`, no CORS involved.

**Evidence:** `task-final-verification.mjs` scenario 3 confirms `API_BASE ===
'/api'` on `127.0.0.1`, and drives a real fetch through it (via
BroadcastChannel → `verifyCheckout`) to confirm the request actually lands on
`http://127.0.0.1:<port>/...`, not the old hardcoded prod host. 3/3 PASS.
Existing `task-7`/`task-8` batteries (which stub `**/api/checkout-status**` /
`**/api/validate-license**` via Playwright glob routes) needed **no changes**
— the glob pattern matches the new relative URL exactly as it matched the
old absolute one — confirmed by both batteries staying green unmodified
(49/49, 29/29).

## 4. MINOR — Unguarded BroadcastChannel constructor

**File:** `js/checkout.js`.

Wrapped `new BroadcastChannel('bl-checkout')` in try/catch; on failure
`checkoutChannel` stays `null` and a `console.warn` fires. Nothing else in
the file depends on `checkoutChannel` being non-null (the `postMessage`
listener and `verifyCheckout` are independent), so Pro restoration, manual
license entry, and the postMessage fallback all keep working without it.

**Evidence:** covered structurally by the unchanged task-7 battery (all its
BroadcastChannel-driven scenarios, 1/2/3/9/10, still pass with the try/catch
in place — proving the guard didn't change happy-path behavior). Not
separately regression-tested for the unsupported-browser case (Playwright's
Chromium always has BroadcastChannel), consistent with how
`checkout-success.html`'s pre-existing identical guard is verified.

## 5. MINOR — timerBadge false button-role for screen readers

**Files:** `js/gate-modal.js`, `js/timer.js`.

Added `updateTimerBadgeAffordance()` in `js/gate-modal.js`: applies
`role="button"`/`tabindex="0"`/`aria-label`/pointer cursor only when
`sessionGateActive()` is true, and strips all four otherwise. Called from
`js/timer.js`'s `updateTimerDisplay()` (every tick, syncs with current gate
state) and `switchTimerToProMode()` (immediately strips the affordance on a
Pro purchase), plus once at gate-modal.js load time for the initial
not-yet-gated state.

**Evidence:** exercised indirectly — the "Low" badge state (mid-session
warning, `sessionSeconds <= 120`) and "Ended" state both already run through
`updateTimerDisplay()` in the full suite's timer-display tests (still 120/120
green), and task-8 scenario 2's badge assertions (visible/hidden, aria-label)
still pass unmodified. Not given a dedicated new accessibility-attribute
assertion — flagging this as the one finding without a fresh PASS/FAIL line
naming it directly; the existing coverage exercises the code paths that call
the new function without asserting on `role`/`tabindex` specifically.

## 6. MINOR — analytics.js console.debug outside try/catch, always-on

**File:** `js/analytics.js`.

Moved `console.debug` inside the try/catch, and gated it on `!POSTHOG_KEY`
(empty = dev, per the file's own existing convention) so a configured
production key stops logging every tracked event to the console:

```js
function track(name, props) {
  try {
    if (window.posthog && typeof posthog.capture === 'function') posthog.capture(name, props || {});
    if (!POSTHOG_KEY) console.debug('[track]', name, props || {});
  } catch (e) { /* analytics must never break the app */ }
}
```

**What I did, stated plainly:** dev visibility is preserved exactly as
before (empty `POSTHOG_KEY`, the checked-in dev default, still logs every
event) — only the production case (a real key set) goes quiet.

**Evidence:** every `[track]` console-line assertion across all three
verification scripts (task-7, task-8, task-final) still passes — `POSTHOG_KEY`
stays `''` in `js/config.js`, so `!POSTHOG_KEY` is true and logging is
unchanged in the environment those scripts run in. Full suite 120/120 green.

## 7. MINOR — grantExtension() unguarded resumeCountdown(); startSessionTimer() doesn't clear existing interval

**Files:** `js/checkout.js`, `js/timer.js`.

- `grantExtension()`: `resumeCountdown()` now guarded with `if
  (timerStarted)` — a bounded internal retry or redelivered grant can
  resolve after the user has hit Restart (`timerStarted` reset to false),
  and the old unconditional call would start a ticking interval for a
  session that was never (re-)started.
- `startSessionTimer()`: added `if (timerInterval) clearInterval(timerInterval);`
  immediately before assigning the new countdown interval — defensive
  double-start guard alongside the existing `if (timerStarted) return;`.

**Evidence:** full suite 120/120, task-7 battery 49/49 (scenarios 1/3/9/10
all exercise `grantExtension()` and confirm the countdown resumes correctly
in the normal case), task-8 battery 29/29 (exercises `startSessionTimer()`
repeatedly across restarts). No regression in either guard's normal-path
behavior.

## 8. MINOR — verifyCheckout retry-exhaustion message doesn't fit Pro

**File:** `js/checkout.js`, `verifyCheckout()`'s `OPEN_RETRY_MAX_ATTEMPTS`
exhaustion branch.

Tailored the announcement on `data.product`:

```js
announceToScreenReader(
  data.product === 'pro'
    ? 'Payment still processing — if it completes, use Enter license key to activate Pro.'
    : 'Payment still processing — if it completes, click Add 10 minutes again or use Enter license key.'
);
```

**Evidence:** not independently exercised by a new automated assertion (the
5-attempt/15s exhaustion window wasn't worth a dedicated slow scenario for a
copy-only change) — verified by direct code read plus the surrounding
`verifyCheckout` logic staying covered and green across all three
verification scripts (task-7 scenarios 9/10 exercise the retry path itself,
just not to full exhaustion).

## 9. DOCS — docs/experiment-log.md pending pre-launch items

Added to the "Pending pre-launch" list:
- Three named E2E scenarios still owed against a real deploy: the
  foil.engineering-tab extend purchase (opener-survival, Controller Ruling E's
  single delivery thread), the ref-playing-at-0:00 regression check (this
  fix wave's item 1, against a real deploy not just the local harness), and
  the 403-branch confirmation on `api/validate-license.mjs` (status-code
  mapping not independently confirmed against Polar's live endpoint).
- "Date the v1.2.0 CHANGELOG.md entry at launch" — it currently has no date,
  unlike every other entry.

## Test Evidence Summary

| Suite | Result | Notes |
|---|---|---|
| `node scripts/ci-run-tests.mjs` | 120 passed / 0 failed | unchanged floor, re-run 3× across the session, stayed green throughout |
| `task-7-verification.mjs` | 49/49 PASS | unmodified — re-run against the changed code, no route-pattern edits needed |
| `task-8-verification.mjs` | 29/29 PASS | unmodified — re-run against the changed code, no route-pattern edits needed |
| `task-final-verification.mjs` (NEW) | 20/20 PASS | 3 scenarios: ref-track-stops-at-gate (engine-level), mid-session revalidation Pro flip (not frozen), API_BASE relative on localhost |

Total: 218/218 assertions passing across all four suites. Log for the new
suite: `.superpowers/sdd/2026-07-30-monetization-experiment/task-final-verification.log`.

## Deviations / notes

- Findings 4 and 8 don't have a dedicated new PASS/FAIL assertion of their
  own (called out above per-finding) — both are narrow, low-risk changes
  (a try/catch guard around a constructor Chromium always supports; a
  string tailored by an already-typed field) where the cost of a new,
  slow, purpose-built scenario didn't seem proportionate. Flagging this
  explicitly rather than padding the "Evidence" sections to imply coverage
  that isn't there.
- Finding 5 is exercised by existing/incidental coverage (the code paths run
  under the full suite and task-8) but likewise has no dedicated new
  assertion checking `role`/`tabindex` directly.
