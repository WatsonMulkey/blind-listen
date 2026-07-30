# Blind Listen Monetization Experiment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the 2026-07-30 monetization experiment: 6:00 free sessions ending in a 3-option paywall modal ($5 session extension / $19 lifetime Pro / close session), Polar.sh checkout with no accounts, full funnel instrumentation.

**Spec:** `docs/superpowers/specs/2026-07-30-monetization-experiment-design.md` — the spec wins on any conflict with this plan.

**Architecture:** Vanilla-JS script-tag globals (no modules, no build step). New client files: `js/config.js` (constants), `js/analytics.js` (event tracking), `js/entitlements.js` (tier state + pure gate logic), `js/gate-modal.js` (paywall modal + close-session flow). Two dependency-free Vercel serverless functions in `api/` call the Polar REST API with bare `fetch`. Entitlements: Pro = Polar license key in `localStorage` validated server-side with a 7-day offline-grace cache; the $5 extension is in-memory only (dies with the page, by design).

**Tech Stack:** Vanilla JS + Web Audio (existing), Polar.sh REST API (merchant of record), Vercel serverless functions (Node built-ins only), PostHog (analytics, free tier), existing in-browser test harness (`test-runner.html`) + headless CI runner.

## Global Constraints

- **Zero-dependency app**: NO `package.json`, NO npm installs, NO build step. `api/` functions use only Node built-ins + global `fetch`. (CI installs Playwright ad hoc; that stays untouched.)
- **Script-tag global scope**: all `js/*.js` files share one global namespace. No `import`/`export`, no modules. Load order in `index.html` matters and is specified in Task 2.
- **FOI-524 rule**: every NEW stateful global MUST also be reset in `resetSessionState()` (`js/app.js:138`).
- **Test floor**: CI floor is `EXPECTED_MIN: 105` in `.github/workflows/ci.yml`. NEVER lower it. Raise it in Task 9 to the measured passed count, with a dated delta line in the workflow header comment (existing pattern).
- **Test pattern**: `test-runner.html` tests PURE functions via copies (see its "COPY OF PURE FUNCTIONS" section, line ~257). New logic that needs tests is written as `*_pure()` functions and copied into the harness with a `// From js/<file>.js` comment. Keep copies in exact sync.
- **Exact values (from spec, verbatim)**: free session = **360** seconds; extension = **+600** seconds for **$5**; lifetime Pro = **$19**; license cache grace = **7 days**; Pro fatigue nudge at **1200** seconds elapsed.
- **Modal copy (verbatim, tweakable only by Watson at visual review)**: title **"Time's up"**; buttons **"Add 10 more minutes — $5"**, **"Buy lifetime license — $19"** (with feature sub-list "No session timer · LUFS metering · Lock-in reshuffle · PDF export"), **"Close session"**.
- **Two origins**: the app is served at `https://blind-listen.vercel.app` AND proxied at `https://foil.engineering/blindlisten`. All client → API calls use the absolute `API_BASE` constant; both origins are CORS-allowed by the functions.
- **Polar environment**: build and test against Polar **sandbox** (`sandbox-api.polar.sh` / sandbox dashboard). Production flip is a deliberate Task 9 step, never implicit.
- **No native `alert()`/new `confirm()` dialogs** in new code (existing `confirm()` calls stay). The gate modal is a DOM overlay.
- **A11y**: gate modal is `role="dialog" aria-modal="true"`, focus-trapped, Esc-dismissable; announcements go through the existing `announceToScreenReader()` (`js/timer.js:52`).
- **Windows dev machine**: repo at `C:\Users\watso\Dev\blind-listen`. Manual test = open `test-runner.html` / `index.html` in a browser.

## Prerequisites (Watson, guided — needed before Task 6 executes)

Collected into Vercel env vars (Preview + Production) and `js/config.js` constants:

1. Polar **sandbox** org → create 2 one-time products: "Session Extension" $5, "Blind Listen Pro (Lifetime)" $19 with a **License Key** benefit → note both product IDs, both **checkout link** URLs, org ID, and an org **access token**.
2. Vercel env vars on the `blind-listen` project: `POLAR_ACCESS_TOKEN`, `POLAR_ORG_ID`, `POLAR_PRODUCT_EXTEND_ID`, `POLAR_PRODUCT_PRO_ID`, `POLAR_ENV=sandbox`.
3. PostHog account (free) → project API key (publishable; safe to ship client-side).

Tasks 1–5 have no Polar dependency and can start immediately.

## Pre-flight (orchestrator, NOT a subagent task)

- New workspace ADR claiming its number in `Dev/docs/decisions/INDEX.md` (supersedes ADR-005's 10:00 length, soft stop, and Supabase Phase 2; records the demand-gate override).
- Linear: re-scope FOI-30 under the experiment framing.
- Create working branch in this repo: `git checkout -b watson/monetization-experiment`. All task commits land on this branch; merge to `main` (= production deploy) only after Watson's visual review.

---

### Task 1: Rebase the free session to 6:00

**Files:**
- Modify: `js/app.js:49` and `js/app.js:191`
- Modify: `index.html:1536` (initial timer display)
- Modify: `test-runner.html` (TIM-001, line ~1312)

**Interfaces:**
- Consumes: nothing new.
- Produces: the literal `360` at both `sessionSeconds` sites (replaced by the `FREE_SESSION_SECONDS` constant in Task 2 — use the bare number here so this task stands alone).

- [ ] **Step 1: Update the failing-first test**

In `test-runner.html`, replace TIM-001 (line ~1312):

```js
  await test('TIM-001', 'fmt(360) = "6:00" (initial state)', () => {
    assert(fmt(360) === '6:00', `Expected "6:00", got "${fmt(360)}"`);
  });
```

(This passes immediately — `fmt` is already correct; the real assertion of this task is the app-state change below. Test count unchanged.)

- [ ] **Step 2: Change both `sessionSeconds` sites**

`js/app.js:49`: `let sessionSeconds = 600;` → `let sessionSeconds = 360;`
`js/app.js:191` (inside `resetSessionState()`): `sessionSeconds = 600;` → `sessionSeconds = 360;`

- [ ] **Step 3: Update the static display**

`index.html:1536`: `<div class="timer-value" id="timerValue">10:00</div>` → `...>6:00</div>`

- [ ] **Step 4: Sweep for stale "10 minute" copy**

Run from repo root (Git Bash): `grep -rn "10:00\|10 min\|ten min" index.html js/ docs/qa-plan.md`
Expected hits: only historical docs. Fix any hit in `index.html`, `js/onboarding.js`, or user-facing copy to say 6 minutes. Leave `docs/` history untouched.

- [ ] **Step 5: Run the suite**

Open `test-runner.html` in a browser (or `node scripts/ci-run-tests.mjs` if Playwright is available). Expected: 105 passed, 0 failed.

- [ ] **Step 6: Commit**

```bash
git add js/app.js index.html test-runner.html js/onboarding.js
git commit -m "feat: free session is now 6:00 (monetization experiment)"
```

---

### Task 2: Config, analytics, and entitlements modules (pure logic, TDD)

**Files:**
- Create: `js/config.js`, `js/analytics.js`, `js/entitlements.js`
- Modify: `index.html` (script tags + PostHog snippet)
- Test: `test-runner.html` (new ENT + GATE suites)

**Interfaces:**
- Consumes: nothing.
- Produces (used by every later task):
  - `js/config.js`: `POLAR_ENV` ('sandbox'|'production'), `CHECKOUT_LINK_EXTEND` (string URL), `CHECKOUT_LINK_PRO` (string URL), `API_BASE` (= `'https://blind-listen.vercel.app/api'`), `POSTHOG_KEY` (string, `''` until launch).
  - `js/analytics.js`: `track(name, props)` — fire-and-forget, no-ops without PostHog.
  - `js/entitlements.js`: `currentTier` ('free'|'pro'), `FREE_SESSION_SECONDS = 360`, `EXTENSION_SECONDS = 600`, `LICENSE_CACHE_MS`, and pure functions `timerEndAction_pure(tier)` → `'gate'|'none'`, `closeSessionRoute_pure(revealed)` → `'reveal-first'|'refresh'`, `gateOptionsFor_pure(trigger)` → array, `applyExtension_pure(seconds)` → number, `licenseCacheValid_pure(validatedAt, now)` → boolean. Also `loadStoredLicense()` / `storeLicense(key)` / `clearLicense()` around localStorage key `'bl_license'`.

- [ ] **Step 1: Write the failing tests**

Append to `test-runner.html` before the "Final summary" block (line ~1345), and add the pure-function copies to the "COPY OF PURE FUNCTIONS" section with a `// From js/entitlements.js` header (initially copy in stubs that return `undefined` so the tests FAIL first):

```js
  suite('ENTITLEMENTS — license cache validity');

  await test('ENT-001', 'Fresh validation (1 day old) is valid', () => {
    const day = 24 * 60 * 60 * 1000;
    assert(licenseCacheValid_pure(Date.now() - day, Date.now()) === true, '1-day-old cache should be valid');
  });

  await test('ENT-002', 'Stale validation (8 days old) is invalid', () => {
    const day = 24 * 60 * 60 * 1000;
    assert(licenseCacheValid_pure(Date.now() - 8 * day, Date.now()) === false, '8-day-old cache should be invalid');
  });

  await test('ENT-003', 'Future-dated validation is invalid (clock tamper)', () => {
    assert(licenseCacheValid_pure(Date.now() + 60_000, Date.now()) === false, 'future validatedAt should be invalid');
  });

  await test('ENT-004', 'Non-numeric validatedAt is invalid', () => {
    assert(licenseCacheValid_pure(undefined, Date.now()) === false, 'undefined should be invalid');
    assert(licenseCacheValid_pure('yesterday', Date.now()) === false, 'string should be invalid');
  });

  suite('GATE LOGIC — timer end, close-session routing, options');

  await test('GATE-001', 'Free tier at timer end gates', () => {
    assert(timerEndAction_pure('free') === 'gate', `Expected 'gate', got '${timerEndAction_pure('free')}'`);
  });

  await test('GATE-002', 'Pro tier at timer end does not gate', () => {
    assert(timerEndAction_pure('pro') === 'none', `Expected 'none', got '${timerEndAction_pure('pro')}'`);
  });

  await test('GATE-003', 'Close on un-revealed session routes through reveal', () => {
    assert(closeSessionRoute_pure(false) === 'reveal-first', 'un-revealed must reveal first');
  });

  await test('GATE-004', 'Close on revealed session refreshes directly', () => {
    assert(closeSessionRoute_pure(true) === 'refresh', 'revealed goes straight to refresh');
  });

  await test('GATE-005', 'Timer trigger offers extend + pro + close', () => {
    const opts = gateOptionsFor_pure('timer');
    assert(JSON.stringify(opts) === JSON.stringify(['extend', 'pro', 'close']), `got ${JSON.stringify(opts)}`);
  });

  await test('GATE-006', 'Feature triggers offer pro only', () => {
    for (const t of ['lufs', 'lockin', 'pdf']) {
      assert(JSON.stringify(gateOptionsFor_pure(t)) === JSON.stringify(['pro']), `trigger ${t} should be pro-only`);
    }
  });

  await test('GATE-007', 'Extension adds 600 seconds from zero', () => {
    assert(applyExtension_pure(0) === 600, `Expected 600, got ${applyExtension_pure(0)}`);
  });

  await test('GATE-008', 'Extension clamps negative remainder to zero first', () => {
    assert(applyExtension_pure(-5) === 600, `Expected 600, got ${applyExtension_pure(-5)}`);
  });

  await test('GATE-009', 'Bypass detected: timer ended, seconds restored, not pro', () => {
    assert(bypassDetected_pure(true, 500, 'free') === true, 'tampered state should flag');
    assert(bypassDetected_pure(false, 500, 'free') === false, 'normal mid-session is fine');
    assert(bypassDetected_pure(true, 0, 'free') === false, 'still-gated state is fine');
    assert(bypassDetected_pure(true, 500, 'pro') === false, 'pro is never a bypass');
  });
```

- [ ] **Step 2: Run tests to verify the 13 new tests fail**

Open `test-runner.html`. Expected: 105 passed, 13 failed (ENT-001..004, GATE-001..009).

- [ ] **Step 3: Create `js/config.js`**

```js
// ─── Experiment Config ────────────────────────────────────────
// Monetization experiment (docs/superpowers/specs/2026-07-30-monetization-experiment-design.md).
// Values marked SANDBOX are swapped to production values at launch (Task 9) — never before.
const POLAR_ENV = 'sandbox';
const CHECKOUT_LINK_EXTEND = '';   // SANDBOX checkout link for the $5 Session Extension (from Polar dashboard)
const CHECKOUT_LINK_PRO = '';      // SANDBOX checkout link for the $19 lifetime Pro
const API_BASE = 'https://blind-listen.vercel.app/api';
const POSTHOG_KEY = '';            // empty = analytics disabled (dev default)
```

- [ ] **Step 4: Create `js/analytics.js`**

```js
// ─── Analytics ────────────────────────────────────────────────
// Thin wrapper: no-ops when PostHog is absent (dev, adblock, empty key),
// so no call site ever needs a guard.
function track(name, props) {
  try {
    if (window.posthog && typeof posthog.capture === 'function') posthog.capture(name, props || {});
  } catch (e) { /* analytics must never break the app */ }
  console.debug('[track]', name, props || {});
}
```

- [ ] **Step 5: Create `js/entitlements.js`**

```js
// ─── Entitlements ─────────────────────────────────────────────
// Tier model for the monetization experiment: 'free' | 'pro'.
// Pro = Polar license key in localStorage, revalidated server-side with a
// 7-day offline grace. The $5 extension is deliberately in-memory only.
// Gates are client-side and devtools-bypassable — accepted trade-off (spec §4).
const LICENSE_STORAGE_KEY = 'bl_license';
const LICENSE_CACHE_MS = 7 * 24 * 60 * 60 * 1000;
const FREE_SESSION_SECONDS = 360;
const EXTENSION_SECONDS = 600;

let currentTier = 'free';

function timerEndAction_pure(tier) {
  return tier === 'pro' ? 'none' : 'gate';
}

function closeSessionRoute_pure(isRevealed) {
  return isRevealed ? 'refresh' : 'reveal-first';
}

function gateOptionsFor_pure(trigger) {
  return trigger === 'timer' ? ['extend', 'pro', 'close'] : ['pro'];
}

function applyExtension_pure(seconds) {
  return Math.max(0, seconds) + EXTENSION_SECONDS;
}

function licenseCacheValid_pure(validatedAt, now) {
  return typeof validatedAt === 'number' && validatedAt <= now && now - validatedAt < LICENSE_CACHE_MS;
}

// Tamper telemetry, not enforcement (spec §4): flags the common console tamper
// (sessionSeconds restored after the gate fired, no verified grant) so the
// case study can report a bypass rate instead of pretending it's zero.
function bypassDetected_pure(timerEndedOnce, seconds, tier) {
  return timerEndedOnce === true && seconds > 0 && tier !== 'pro';
}

function loadStoredLicense() {
  try {
    const raw = localStorage.getItem(LICENSE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;   // {key, validatedAt}
  } catch (e) { return null; }
}

function storeLicense(key) {
  localStorage.setItem(LICENSE_STORAGE_KEY, JSON.stringify({ key, validatedAt: Date.now() }));
}

function clearLicense() {
  localStorage.removeItem(LICENSE_STORAGE_KEY);
}
```

- [ ] **Step 6: Copy the seven `*_pure` functions into `test-runner.html`'s copy section** (replacing the failing stubs), under `// From js/entitlements.js`, together with the `LICENSE_CACHE_MS` and `EXTENSION_SECONDS` constants they close over.

- [ ] **Step 7: Wire script tags**

In `index.html` (script block at line ~1683), the three new files load BEFORE `js/app.js` (Task 3+ code references these globals; `config` first):

```html
<script src="js/config.js"></script>
<script src="js/analytics.js"></script>
<script src="js/entitlements.js"></script>
<script src="js/app.js"></script>
```

Immediately after the `js/config.js` tag, add the PostHog loader (guarded — a no-op while `POSTHOG_KEY` is empty, so dev and CI stay analytics-free):

```html
<script>
  if (typeof POSTHOG_KEY === 'string' && POSTHOG_KEY) {
    !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.async=!0,p.src=s.api_host+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture identify alias people.set people.set_once set_config register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
    posthog.init(POSTHOG_KEY, { api_host: 'https://us.i.posthog.com' });
  }
</script>
```

(Snippet drift note: verify the current loader at posthog.com/docs/libraries/js snippet page during this step; the guard-and-init shape is the contract, the minified body may be newer.)

- [ ] **Step 8: Run tests to verify all pass**

Open `test-runner.html`. Expected: 118 passed, 0 failed. Also open `index.html`, confirm no console errors on load and a normal session still starts.

- [ ] **Step 9: Also change Task 1's literals to the new constants**

`js/app.js:49` → `let sessionSeconds = FREE_SESSION_SECONDS;` and `js/app.js:191` → `sessionSeconds = FREE_SESSION_SECONDS;` (config/entitlements now load first, so the constant exists at parse time).

- [ ] **Step 10: Commit**

```bash
git add js/config.js js/analytics.js js/entitlements.js js/app.js index.html test-runner.html
git commit -m "feat: config/analytics/entitlements modules with pure gate logic (13 tests)"
```

---

### Task 3: Gate modal + timer-end enforcement

**Files:**
- Create: `js/gate-modal.js`
- Modify: `index.html` (modal + wrap-up bar markup, CSS, script tag)
- Modify: `js/timer.js` (fire the gate at 0:00; `resumeCountdown()`)
- Modify: `js/audio-engine.js` (guard in `play()`), `js/ui.js` (guard in `playRef()`)

**Interfaces:**
- Consumes: `timerEndAction_pure`, `gateOptionsFor_pure`, `currentTier`, `track` (Task 2).
- Produces: `showGateModal(trigger)` (trigger: `'timer'|'lufs'|'lockin'|'pdf'`), `hideGateModal()`, `sessionGateActive()` → boolean, `resumeCountdown()`. Buttons `#gateExtendBtn` / `#gateProBtn` call `openCheckout('extend'|'pro')` — defined in Task 7; until then they only `track(...)` (wire the checkout call in Task 7).

- [ ] **Step 1: Add markup to `index.html`** (immediately before the `#srAnnouncer` div, line ~1640):

```html
<div id="gateModal" class="gate-backdrop" role="dialog" aria-modal="true" aria-labelledby="gateModalTitle" hidden>
  <div class="gate-panel">
    <button class="gate-x" id="gateDismissBtn" aria-label="Dismiss">&times;</button>
    <h2 id="gateModalTitle">Time's up</h2>
    <p id="gateModalBody">Six minutes of blind listening is a full session &mdash; fresh ears fade fast. Keep going, or wrap up.</p>
    <div class="gate-actions">
      <button class="gate-btn gate-btn-extend" id="gateExtendBtn">Add 10 more minutes &mdash; $5</button>
      <button class="gate-btn gate-btn-pro" id="gateProBtn">
        Buy lifetime license &mdash; $19
        <span class="gate-pro-features">No session timer &middot; LUFS metering &middot; Lock-in reshuffle &middot; PDF export</span>
      </button>
      <button class="gate-btn gate-btn-close" id="gateCloseSessionBtn">Close session</button>
    </div>
  </div>
</div>
<div id="wrapUpBar" hidden>
  <span>Session closed &mdash; results revealed below.</span>
  <button id="wrapUpDoneBtn">Done &mdash; clear session</button>
</div>
```

- [ ] **Step 2: Add CSS** in `index.html`'s `<style>` block, using the site's existing custom properties (`--text-muted`, `--success`, etc. — match the visual language of `.duration-warning` / existing panels; Watson reviews visually later):

```css
.gate-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.gate-backdrop[hidden] { display: none; }
.gate-panel { position: relative; max-width: 420px; width: calc(100% - 2rem); background: var(--bg-panel, #1a1a1f); border: 1px solid var(--border, #333); border-radius: 12px; padding: 1.5rem; }
.gate-x { position: absolute; top: 0.5rem; right: 0.75rem; background: none; border: none; color: var(--text-muted); font-size: 1.4rem; cursor: pointer; }
.gate-actions { display: flex; flex-direction: column; gap: 0.6rem; margin-top: 1rem; }
.gate-btn { padding: 0.7rem 1rem; border-radius: 8px; cursor: pointer; font-size: 0.95rem; }
.gate-btn-pro { display: flex; flex-direction: column; gap: 0.2rem; }
.gate-pro-features { font-size: 0.75rem; color: var(--text-muted); }
.gate-btn-close { background: none; border: 1px solid var(--border, #333); color: var(--text-muted); }
#wrapUpBar { position: fixed; bottom: 0; left: 0; right: 0; display: flex; gap: 1rem; align-items: center; justify-content: center; padding: 0.8rem; background: var(--bg-panel, #1a1a1f); border-top: 1px solid var(--border, #333); z-index: 900; }
#wrapUpBar[hidden] { display: none; }
```

- [ ] **Step 3: Create `js/gate-modal.js`**

```js
// ─── Gate Modal ───────────────────────────────────────────────
// The experiment's paywall surface (spec §3). Timer trigger shows all three
// options; feature triggers (lufs/lockin/pdf) show Pro only. Dismissal is
// always possible (a11y) and sells nothing short — transport stays locked
// by sessionGateActive() while the free session is over.
const gateModal = document.getElementById('gateModal');
const gateModalTitle = document.getElementById('gateModalTitle');
const gateModalBody = document.getElementById('gateModalBody');
const gateExtendBtn = document.getElementById('gateExtendBtn');
const gateProBtn = document.getElementById('gateProBtn');
const gateCloseSessionBtn = document.getElementById('gateCloseSessionBtn');
const gateDismissBtn = document.getElementById('gateDismissBtn');
const wrapUpBar = document.getElementById('wrapUpBar');
const wrapUpDoneBtn = document.getElementById('wrapUpDoneBtn');

let gateTrigger = null;
let gateReturnFocus = null;

const GATE_COPY = {
  timer:  { title: "Time's up", body: 'Six minutes of blind listening is a full session \u2014 fresh ears fade fast. Keep going, or wrap up.' },
  lufs:   { title: "That's a Pro feature", body: 'LUFS, peak, and RMS metering come with the lifetime license.' },
  lockin: { title: "That's a Pro feature", body: 'Lock in a pick and reshuffle to test your consistency \u2014 a lifetime-license feature.' },
  pdf:    { title: "That's a Pro feature", body: 'PDF reports come with the lifetime license. Text export is always free.' },
};

function showGateModal(trigger) {
  gateTrigger = trigger;
  gateReturnFocus = document.activeElement;
  const copy = GATE_COPY[trigger] || GATE_COPY.timer;
  gateModalTitle.textContent = copy.title;
  gateModalBody.textContent = copy.body;
  const opts = gateOptionsFor_pure(trigger);
  gateExtendBtn.hidden = !opts.includes('extend');
  gateCloseSessionBtn.hidden = !opts.includes('close');
  gateModal.hidden = false;
  gateProBtn.focus();
  track('gate_shown', { trigger, revealed });
  announceToScreenReader(copy.title + '. ' + copy.body);
}

function hideGateModal() {
  gateModal.hidden = true;
  gateTrigger = null;
  if (gateReturnFocus && document.contains(gateReturnFocus)) gateReturnFocus.focus();
}

function sessionGateActive() {
  return timerStarted && sessionSeconds <= 0 && currentTier !== 'pro';
}

// Dismissal (Esc / × / backdrop) is tracked separately from purchase-driven
// hides — an instant dismiss-then-close pattern is the funnel's rage-quit signal.
function dismissGate() {
  track('gate_dismissed', { trigger: gateTrigger });
  hideGateModal();
}

gateDismissBtn.addEventListener('click', dismissGate);
gateModal.addEventListener('click', (e) => { if (e.target === gateModal) dismissGate(); });
gateModal.addEventListener('keydown', (e) => {
  e.stopPropagation(); // keep the app's document-level shortcuts out of the modal
  if (e.key === 'Escape') { dismissGate(); return; }
  if (e.key === 'Tab') {
    const focusables = [...gateModal.querySelectorAll('button')].filter(b => !b.hidden);
    const first = focusables[0], last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});

gateExtendBtn.addEventListener('click', () => {
  track('extend_clicked', { trigger: gateTrigger });
  openCheckout('extend');   // defined in Task 7 (js/checkout.js)
});

gateProBtn.addEventListener('click', () => {
  track('pro_clicked', { trigger: gateTrigger });
  openCheckout('pro');      // defined in Task 7 (js/checkout.js)
});

gateCloseSessionBtn.addEventListener('click', () => {
  track('close_session_clicked', { revealed });
  if (closeSessionRoute_pure(revealed) === 'refresh') { location.reload(); return; }
  // Reveal-first route (spec §3): never destroy an un-revealed test.
  hideGateModal();
  performReveal();          // extracted in Task 4 (js/ui.js)
  wrapUpBar.hidden = false;
  wrapUpDoneBtn.focus();
});

wrapUpDoneBtn.addEventListener('click', () => location.reload());

// Re-open the gate from the "Ended" timer badge.
timerBadge.style.cursor = 'pointer';
timerBadge.setAttribute('role', 'button');
timerBadge.setAttribute('tabindex', '0');
timerBadge.setAttribute('aria-label', 'Session ended — show options');
timerBadge.addEventListener('click', () => { if (sessionGateActive()) showGateModal('timer'); });
timerBadge.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && sessionGateActive()) { e.preventDefault(); showGateModal('timer'); }
});
```

Until Tasks 4 and 7 land, `performReveal` and `openCheckout` are undefined — add temporary stubs at the BOTTOM of `js/gate-modal.js`, each marked for removal:

```js
// TEMP until Task 4/7 land — replaced there, remove then.
if (typeof performReveal === 'undefined') { window.performReveal = () => revealBtn.click(); }
if (typeof openCheckout === 'undefined') { window.openCheckout = (p) => console.warn('checkout not wired yet:', p); }
```

- [ ] **Step 4: Add the script tag** for `js/gate-modal.js` AFTER `js/export.js` (needs DOM + `revealBtn` + timer globals), before `js/onboarding.js`.

- [ ] **Step 5: Fire the gate from the timer** — in `js/timer.js`, inside `startSessionTimer()`'s interval callback, extract the tick body into a named function and use it (needed again by `resumeCountdown()`):

```js
function sessionTick() {
  sessionSeconds--;
  updateTimerDisplay();
  if (sessionSeconds <= 0) {
    clearInterval(timerInterval);
    timerInterval = null;
    sessionSeconds = 0;
    timerEndedOnce = true;   // cleared only by a verified extension grant (bypass telemetry)
    updateTimerDisplay();
    if (isPlaying) pause();
    if (timerEndAction_pure(currentTier) === 'gate') {
      track('timer_end');
      showGateModal('timer');
    }
  }
}
```

Also declare two new globals in `js/app.js`'s State block — `let timerEndedOnce = false;` and `let bypassReported = false;` — and reset BOTH in `resetSessionState()` (FOI-524).

```js

function startSessionTimer() {
  if (timerStarted) return;
  timerStarted = true;
  track('session_start', { tier: currentTier });
  updateTimerDisplay();
  timerInterval = setInterval(sessionTick, 1000);
}

function resumeCountdown() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(sessionTick, 1000);
}
```

Also add `track('timer_warning')` inside `updateTimerDisplay()`'s existing `sessionSeconds <= 120` branch, next to the `announceToScreenReader('2 minutes remaining...')` call (fires once thanks to `lastAnnouncedThreshold`).

- [ ] **Step 6: Lock the transport while gated** — top of `play()` in `js/audio-engine.js` (read the function first; insert as the first statements) and top of `playRef()` in `js/ui.js:195`:

```js
  if (typeof sessionGateActive === 'function' && sessionGateActive()) { showGateModal('timer'); return; }
  // Tamper telemetry only — playback proceeds (spec §4). Fires once per session.
  if (typeof bypassDetected_pure === 'function' && !bypassReported &&
      bypassDetected_pure(timerEndedOnce, sessionSeconds, currentTier)) {
    bypassReported = true;
    track('gate_bypassed');
  }
```

(`switchTo()` routes through `play()` only when `wasPlaying`, and Space routes through `playBtn.click()` → `play()`/`playRef()` — both covered by these two guards.)

- [ ] **Step 7: Dev time-warp param** — near the top of `js/app.js` (after the DOM-refs block), honor `?t=<seconds>` on non-production hosts only, so UX testing can reach the gate in seconds:

```js
// UX-testing time warp: ?t=15 gives a 15-second free session. Never honored on
// production hostnames; preview deploys and localhost only. First session only —
// resetSessionState() returns to FREE_SESSION_SECONDS (acceptable for testing).
const PROD_HOSTS = ['blind-listen.vercel.app', 'foil.engineering'];
(function applyTimeWarp() {
  const t = new URLSearchParams(location.search).get('t');
  if (!t || PROD_HOSTS.includes(location.hostname)) return;
  const secs = parseInt(t, 10);
  if (Number.isFinite(secs) && secs >= 5) sessionSeconds = secs;
})();
```

- [ ] **Step 8: Manual test** — open `index.html` locally with `?t=15`, start a session, wait for 0:00. Expected: playback pauses, modal appears with all three buttons, Esc dismisses (`[track] gate_dismissed` in console debug), badge re-opens it, play/Space re-opens it instead of playing, close-session on an un-revealed session reveals then shows the wrap-up bar, Done reloads to the upload screen. Tamper check: at the gate, set `sessionSeconds = 500` in the console, press play — playback resumes AND `[track] gate_bypassed` logs once.

- [ ] **Step 9: Run the suite** — open `test-runner.html`. Expected: 118 passed, 0 failed.

- [ ] **Step 10: Commit**

```bash
git add js/gate-modal.js js/timer.js js/audio-engine.js js/ui.js index.html
git commit -m "feat: timer-end gate modal with 3 options, transport lock, a11y focus trap"
```

---

### Task 4: `performReveal()` extraction + close-session reveal route

**Files:**
- Modify: `js/ui.js:321-354` (reveal listener)
- Modify: `js/gate-modal.js` (remove the TEMP `performReveal` stub)

**Interfaces:**
- Consumes: the existing reveal listener body.
- Produces: `performReveal()` — the full reveal (buttons renamed, locks disabled, export shown, consistency verdict) with NO `confirm()`; the button listener keeps its `confirm()` and delegates.

- [ ] **Step 1: Refactor** — in `js/ui.js`, replace the `revealBtn` listener with:

```js
function performReveal() {
  if (revealed) return;
  revealed = true;
  revealBtn.textContent = 'Revealed!';
  revealBtn.disabled = true;

  mixButtons.querySelectorAll('.mix-btn').forEach((btn, i) => {
    const fileIdx = shuffleMap[i];
    const name = files[fileIdx].name.replace(/\.[^.]+$/, '');
    btn.classList.add('revealed');
    btn.textContent = `${LABELS[i]}\n${name}`;
    btn.style.whiteSpace = 'pre-line';
  });

  mixButtons.querySelectorAll('.fav-btn').forEach(btn => { btn.disabled = true; });

  showExportButtons();

  if (hasReshuffled && firstPickFileIndex >= 0 && activeIndex >= 0) {
    const currentFileIndex = shuffleMap[activeIndex];
    const same = currentFileIndex === firstPickFileIndex;
    consistencyResult.textContent = same
      ? '\u2713 Consistent — you picked the same file both times!'
      : '\u2717 Different picks — first round vs. second round were different files';
    consistencyResult.classList.remove('match', 'differ');
    consistencyResult.classList.add('visible', same ? 'match' : 'differ');
  }
}

revealBtn.addEventListener('click', () => {
  if (revealed) return;
  if (!confirm('Reveal file names? This ends the blind test and cannot be undone.')) return;
  performReveal();
});
```

(Byte-for-byte the old listener body — only the `confirm()` stays behind in the listener. The gate's close-session path calls `performReveal()` directly: the user already chose to end the test.)

- [ ] **Step 2: Remove the TEMP `performReveal` stub** from the bottom of `js/gate-modal.js`.

- [ ] **Step 3: Manual test** — normal reveal via the button still asks to confirm and works; gate → Close session on an un-revealed session reveals WITHOUT a confirm dialog, shows the wrap-up bar; on a revealed session, Close reloads immediately.

- [ ] **Step 4: Run the suite** — Expected: 117 passed, 0 failed.

- [ ] **Step 5: Commit**

```bash
git add js/ui.js js/gate-modal.js
git commit -m "refactor: extract performReveal() so close-session can reveal without confirm()"
```

---

### Task 5: Feature gates (LUFS display, lock-in, PDF export)

**Files:**
- Modify: `js/metering.js` (`renderMixStats()` — find it with `grep -n "function renderMixStats" js/*.js`)
- Modify: `js/ui.js:81` (`toggleLock()`)
- Modify: `js/export.js` (the `exportPdfBtn` click handler — find with `grep -n "exportPdfBtn" js/export.js`)

**Interfaces:**
- Consumes: `showGateModal(trigger)`, `currentTier`.
- Produces: nothing new — behavior only. IMPORTANT: `computeAllMetering()` and level matching stay untouched and FREE; only the stats *display* is gated (spec §2).

- [ ] **Step 1: Gate the LUFS display** — first statement of `renderMixStats()`:

```js
  if (currentTier !== 'pro') {
    mixStatsRow.innerHTML = '<button class="lufs-locked" id="lufsLockedBtn" aria-label="LUFS metering is a Pro feature">\uD83D\uDD12 LUFS \u00b7 peak \u00b7 RMS \u2014 Pro</button>';
    document.getElementById('lufsLockedBtn').addEventListener('click', () => showGateModal('lufs'));
    return;
  }
```

Add matching CSS in `index.html` (muted chip, same family as `.gate-btn-close`):

```css
.lufs-locked { background: none; border: 1px dashed var(--border, #333); color: var(--text-muted); border-radius: 6px; padding: 0.3rem 0.6rem; font-size: 0.8rem; cursor: pointer; }
```

- [ ] **Step 2: Gate lock-in** — first statement of `toggleLock()` in `js/ui.js:81` (before the `if (revealed)` check):

```js
  if (currentTier !== 'pro') { showGateModal('lockin'); return; }
```

(`reshuffleBtn` stays free — spec §2 keeps "basic reshuffle" free; only the pick-lock + consistency flow is Pro.)

- [ ] **Step 3: Gate PDF export** — first statement of the `exportPdfBtn` click handler in `js/export.js`:

```js
  if (currentTier !== 'pro') { showGateModal('pdf'); return; }
```

- [ ] **Step 4: Manual test** — as free: LUFS row shows the locked chip → modal (Pro-only variant: no extend, no close-session); ★ Pick → modal; Download PDF → modal; text export still works. In DevTools set `currentTier = 'pro'` and re-run `renderMixStats()` → real stats render; Pick and PDF work.

- [ ] **Step 5: Run the suite** — Expected: 117 passed, 0 failed.

- [ ] **Step 6: Commit**

```bash
git add js/metering.js js/ui.js js/export.js index.html
git commit -m "feat: Pro feature gates on LUFS display, lock-in, and PDF export"
```

---### Task 6: Serverless functions — `checkout-status` + `validate-license`

**Files:**
- Create: `api/checkout-status.js`, `api/validate-license.js`, `api/_polar.js`

**Interfaces:**
- Consumes: Vercel env vars `POLAR_ACCESS_TOKEN`, `POLAR_ORG_ID`, `POLAR_PRODUCT_EXTEND_ID`, `POLAR_PRODUCT_PRO_ID`, `POLAR_ENV`.
- Produces (client contract, used by Task 7):
  - `GET {API_BASE}/checkout-status?id=<checkoutId>` → `200 {status: 'succeeded'|'open'|'expired', product: 'extend'|'pro'|null, licenseKey: string|null}`
  - `POST {API_BASE}/validate-license` body `{"key": "..."}` → `200 {valid: true}` or `200 {valid: false}`
  - Both send CORS headers for exactly `https://blind-listen.vercel.app` and `https://foil.engineering`.

- [ ] **Step 1: Verify the Polar REST shapes against live docs** (they are stable but confirm before coding): WebFetch `https://docs.polar.sh/api-reference/checkouts/get` (checkout object: `status`, `product_id`), `https://docs.polar.sh/api-reference/customer-portal/license-keys/validate` (validate endpoint + whether it needs the org token or is public), and the sandbox base URL page. Adjust paths below if the docs disagree — the RESPONSE CONTRACT above must not change.

- [ ] **Step 2: Create `api/_polar.js`** (shared helper; underscore-prefixed files are not exposed as routes by Vercel):

```js
// Shared Polar REST helper for the api/ functions. Zero dependencies — the
// app's zero-dependency claim covers these functions too (bare fetch only).
const POLAR_BASE = process.env.POLAR_ENV === 'production'
  ? 'https://api.polar.sh'
  : 'https://sandbox-api.polar.sh';

const ALLOWED_ORIGINS = ['https://blind-listen.vercel.app', 'https://foil.engineering'];

export function applyCors(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export async function polarGet(path) {
  const r = await fetch(`${POLAR_BASE}${path}`, {
    headers: { Authorization: `Bearer ${process.env.POLAR_ACCESS_TOKEN}` },
  });
  if (!r.ok) throw new Error(`Polar ${path} -> ${r.status}`);
  return r.json();
}

export async function polarPost(path, body) {
  const r = await fetch(`${POLAR_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.POLAR_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return r; // callers branch on status
}
```

- [ ] **Step 3: Create `api/checkout-status.js`**

```js
import { applyCors, polarGet } from './_polar.js';

// GET /api/checkout-status?id=<checkoutId>
// -> {status, product: 'extend'|'pro'|null, licenseKey: string|null}
// licenseKey is best-effort: if the grants lookup fails, the buyer still has
// the key via Polar's email + the app's manual "Enter license key" input.
export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'method' });

  const id = req.query.id;
  if (!id || typeof id !== 'string') return res.status(400).json({ error: 'missing id' });

  try {
    const checkout = await polarGet(`/v1/checkouts/${encodeURIComponent(id)}`);
    const product =
      checkout.product_id === process.env.POLAR_PRODUCT_EXTEND_ID ? 'extend' :
      checkout.product_id === process.env.POLAR_PRODUCT_PRO_ID ? 'pro' : null;

    let licenseKey = null;
    if (checkout.status === 'succeeded' && product === 'pro' && checkout.customer_id) {
      try {
        // License keys are granted per-customer via the product's benefit.
        // Endpoint per docs check in Step 1; expected: list license keys
        // filtered by organization + customer, newest first.
        const keys = await polarGet(
          `/v1/license-keys?organization_id=${process.env.POLAR_ORG_ID}&customer_id=${encodeURIComponent(checkout.customer_id)}&limit=1`
        );
        licenseKey = keys.items && keys.items[0] ? keys.items[0].key : null;
      } catch (e) { /* best-effort — manual entry covers this */ }
    }

    return res.status(200).json({ status: checkout.status, product, licenseKey });
  } catch (e) {
    return res.status(502).json({ error: 'polar unreachable' });
  }
}
```

- [ ] **Step 4: Create `api/validate-license.js`**

```js
import { applyCors, polarPost } from './_polar.js';

// POST /api/validate-license {key} -> {valid: boolean}
// 200 always (a bad key is a normal answer, not an error); 502 only when
// Polar itself is unreachable so the client can apply its 7-day grace.
export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });

  const key = req.body && req.body.key;
  if (!key || typeof key !== 'string') return res.status(400).json({ error: 'missing key' });

  try {
    const r = await polarPost('/v1/customer-portal/license-keys/validate', {
      key,
      organization_id: process.env.POLAR_ORG_ID,
    });
    if (r.ok) return res.status(200).json({ valid: true });
    if (r.status === 404 || r.status === 400 || r.status === 403) return res.status(200).json({ valid: false });
    return res.status(502).json({ error: `polar ${r.status}` });
  } catch (e) {
    return res.status(502).json({ error: 'polar unreachable' });
  }
}
```

- [ ] **Step 5: Verify on a preview deploy** (functions can't run locally without the Vercel CLI). Push the branch — Vercel builds a preview. Then, with a sandbox checkout ID from the Polar dashboard (make a $5 sandbox test purchase using Polar's sandbox test card):

```bash
curl -s "https://<preview-url>/api/checkout-status?id=<sandbox-checkout-id>"
# expect: {"status":"succeeded","product":"extend","licenseKey":null}
curl -s -X POST "https://<preview-url>/api/validate-license" -H "Content-Type: application/json" -d '{"key":"nonsense"}'
# expect: {"valid":false}
```

If either curl surprises, re-check Step 1's doc shapes before touching the client.

- [ ] **Step 6: Commit**

```bash
git add api/_polar.js api/checkout-status.js api/validate-license.js
git commit -m "feat: dependency-free Polar functions — checkout-status + validate-license, CORS for both origins"
```

---

### Task 7: Checkout client — purchase flows, grants, license entry

**Files:**
- Create: `js/checkout.js`, `checkout-success.html`
- Modify: `index.html` (script tag; footer "Enter license key" link), `js/gate-modal.js` (remove TEMP `openCheckout` stub), `js/timer.js` (nothing — `resumeCountdown` exists), `js/app.js` (reset additions)

**Interfaces:**
- Consumes: `CHECKOUT_LINK_EXTEND`, `CHECKOUT_LINK_PRO`, `API_BASE` (Task 2); `grantExtension`/`activatePro` produced HERE; `resumeCountdown` (Task 3); `storeLicense`/`loadStoredLicense`/`clearLicense`/`licenseCacheValid_pure` (Task 2).
- Produces: `openCheckout(product)`, `grantExtension()`, `activatePro(key)`, `initEntitlementsOnLoad()`.

- [ ] **Step 1: Configure the Polar checkout links** (Watson's sandbox dashboard, guided): each checkout link's Success URL = `https://blind-listen.vercel.app/checkout-success.html?checkout_id={CHECKOUT_ID}` — confirm the exact template variable name on the docs page for checkout links while setting it. Paste both link URLs into `js/config.js`.

- [ ] **Step 2: Create `checkout-success.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Blind Listen — Payment received</title>
<style>body{font-family:system-ui;background:#111;color:#eee;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}div{text-align:center}</style>
</head>
<body>
<div>
  <h1>Payment received</h1>
  <p id="msg">Return to your Blind Listen tab — your purchase is being applied.</p>
</div>
<script>
  const id = new URLSearchParams(location.search).get('checkout_id');
  if (id) {
    new BroadcastChannel('bl-checkout').postMessage({ checkoutId: id });
  } else {
    document.getElementById('msg').textContent = 'Missing checkout reference — if you paid for Pro, use "Enter license key" in the app (the key is also in your email).';
  }
</script>
</body>
</html>
```

- [ ] **Step 3: Create `js/checkout.js`**

```js
// ─── Checkout & Grants ────────────────────────────────────────
// Checkout opens in a NEW TAB (the session page must never unload — decoded
// AudioBuffers die with it, spec §4). The success page broadcasts the
// checkout id back; we verify server-side before granting anything.
function openCheckout(product) {
  const url = product === 'extend' ? CHECKOUT_LINK_EXTEND : CHECKOUT_LINK_PRO;
  if (!url) { console.warn('checkout link not configured for', product); return; }
  track('checkout_opened', { product });
  window.open(url, '_blank', 'noopener');
}

const checkoutChannel = new BroadcastChannel('bl-checkout');
checkoutChannel.onmessage = async (e) => {
  const checkoutId = e.data && e.data.checkoutId;
  if (!checkoutId) return;
  try {
    const r = await fetch(`${API_BASE}/checkout-status?id=${encodeURIComponent(checkoutId)}`);
    if (!r.ok) throw new Error(`status ${r.status}`);
    const data = await r.json();
    if (data.status !== 'succeeded') return;
    track('checkout_completed', { product: data.product });
    if (data.product === 'extend') grantExtension();
    if (data.product === 'pro') {
      if (data.licenseKey) activatePro(data.licenseKey);
      else promptLicenseEntry('Payment confirmed — paste the license key from your email to activate Pro.');
    }
  } catch (err) {
    console.warn('checkout verification failed:', err.message);
    announceToScreenReader('Purchase verification failed — if you paid, use Enter license key or add minutes again.');
  }
};

function grantExtension() {
  sessionSeconds = applyExtension_pure(sessionSeconds);
  timerEndedOnce = false;   // verified grant — re-arms the gate AND the bypass telemetry
  hideGateModal();
  updateTimerDisplay();
  resumeCountdown();
  announceToScreenReader('10 minutes added to your session.');
}

function activatePro(key) {
  storeLicense(key);
  currentTier = 'pro';
  hideGateModal();
  track('license_activated');
  switchTimerToProMode();       // Task 8; TEMP stub below until then
  if (typeof renderMixStats === 'function' && player.classList.contains('active')) renderMixStats();
  announceToScreenReader('Pro activated. The session timer is gone for good.');
}

// Manual license entry — covers new browsers and any auto-retrieval miss.
function promptLicenseEntry(message) {
  const current = prompt(message || 'Paste your Blind Listen Pro license key:');
  if (!current) return;
  validateAndActivate(current.trim());
}

async function validateAndActivate(key) {
  try {
    const r = await fetch(`${API_BASE}/validate-license`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    });
    if (!r.ok) throw new Error(`status ${r.status}`);
    const data = await r.json();
    if (data.valid) activatePro(key);
    else announceToScreenReader('That license key is not valid.');
  } catch (err) {
    announceToScreenReader('Could not reach the license server — try again shortly.');
  }
}

// On load: restore Pro from a stored license, honoring the 7-day grace.
async function initEntitlementsOnLoad() {
  const stored = loadStoredLicense();
  if (!stored || !stored.key) return;
  if (licenseCacheValid_pure(stored.validatedAt, Date.now())) {
    currentTier = 'pro';
    revalidateInBackground(stored.key);
    return;
  }
  // Cache expired: must revalidate before honoring Pro.
  try {
    const r = await fetch(`${API_BASE}/validate-license`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: stored.key }),
    });
    const data = r.ok ? await r.json() : null;
    if (data && data.valid) { storeLicense(stored.key); currentTier = 'pro'; }
    else if (data && data.valid === false) clearLicense();   // definitively revoked
    // 502/network: leave stored key, stay free this load (grace already spent)
  } catch (e) { /* stay free this load */ }
}

// Refresh the grace window opportunistically; downgrade only on a definitive "invalid".
async function revalidateInBackground(key) {
  try {
    const r = await fetch(`${API_BASE}/validate-license`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    });
    if (!r.ok) return;
    const data = await r.json();
    if (data.valid) storeLicense(key);
    else { clearLicense(); currentTier = 'free'; }
  } catch (e) { /* offline — grace cache already covers this */ }
}

initEntitlementsOnLoad();

// TEMP until Task 8 lands — replaced there, remove then.
if (typeof switchTimerToProMode === 'undefined') { window.switchTimerToProMode = () => {}; }
```

- [ ] **Step 4: Wire it up** — script tag for `js/checkout.js` after `js/gate-modal.js`; remove the TEMP `openCheckout` stub from `js/gate-modal.js`; add a quiet footer link in `index.html` near the existing footer/credits: `<button id="licenseEntryLink" class="link-btn">Enter license key</button>` with `document.getElementById('licenseEntryLink').addEventListener('click', () => promptLicenseEntry());` at the bottom of `js/checkout.js` (style `.link-btn` as an unobtrusive text link).

- [ ] **Step 5: FOI-524 reset additions** — in `resetSessionState()` (`js/app.js`): nothing persists from checkout (extension is in-memory `sessionSeconds`, already reset; `currentTier` deliberately survives restarts). Add a comment line there documenting that decision:

```js
  // Monetization experiment: currentTier deliberately NOT reset (Pro survives restart);
  // extension minutes live in sessionSeconds and die with the session by design.
```

- [ ] **Step 6: End-to-end sandbox test on the preview deploy** — full $5 flow: session → 0:00 → gate → Add 10 minutes → sandbox card in the new tab → back in the app tab the timer reads 10:00 and counts down. Full $19 flow: gate → Buy lifetime → pay → Pro activates (or the license prompt appears and pasting the emailed key activates). Reload → still Pro. `localStorage.clear()` + reload → free again; Enter license key → Pro.

- [ ] **Step 7: Run the suite** — Expected: 117 passed, 0 failed.

- [ ] **Step 8: Commit**

```bash
git add js/checkout.js checkout-success.html js/gate-modal.js js/app.js index.html
git commit -m "feat: Polar checkout flows — new-tab purchase, verified grants, license entry + 7-day grace"
```

---

### Task 8: Pro timer experience (count-up + fatigue nudge)

**Files:**
- Modify: `js/timer.js`, `js/app.js` (new global + reset), `index.html` (toast markup/CSS)
- Modify: `js/checkout.js` (remove TEMP `switchTimerToProMode` stub)
- Test: `test-runner.html` (PRO suite)

**Interfaces:**
- Consumes: `currentTier`, `fmt`, `announceToScreenReader`, `track`.
- Produces: `switchTimerToProMode()`, `proTick()`, pure `proNudgeDue_pure(elapsedSeconds, nudgeShown)` → boolean; global `proElapsedSeconds` + `proNudgeShown` (reset in `resetSessionState()` per FOI-524).

- [ ] **Step 1: Write the failing tests** (copy section + suite, same pattern as Task 2):

```js
  suite('PRO TIMER — count-up + fatigue nudge');

  await test('PRO-001', 'Nudge due exactly at 1200s elapsed, once', () => {
    assert(proNudgeDue_pure(1200, false) === true, 'due at 1200');
    assert(proNudgeDue_pure(1199, false) === false, 'not before 1200');
    assert(proNudgeDue_pure(1300, true) === false, 'never twice');
  });

  await test('PRO-002', 'Nudge not due for free-tier magnitudes', () => {
    assert(proNudgeDue_pure(0, false) === false, 'not at start');
    assert(proNudgeDue_pure(360, false) === false, 'not at the free session length');
  });
```

- [ ] **Step 2: Run to verify both fail** (function undefined). Expected: 118 passed, 2 failed.

- [ ] **Step 3: Implement** — in `js/app.js` State block: `let proElapsedSeconds = 0;` and `let proNudgeShown = false;` + both reset in `resetSessionState()`. In `js/timer.js`:

```js
function proNudgeDue_pure(elapsedSeconds, nudgeShown) {
  return !nudgeShown && elapsedSeconds >= 1200;
}

function proTick() {
  proElapsedSeconds++;
  timerValue.textContent = fmt(proElapsedSeconds);
  if (proNudgeDue_pure(proElapsedSeconds, proNudgeShown)) {
    proNudgeShown = true;
    showFatigueToast();
  }
}

function switchTimerToProMode() {
  if (timerInterval) clearInterval(timerInterval);
  proElapsedSeconds = Math.max(0, FREE_SESSION_SECONDS - sessionSeconds);
  timerValue.classList.remove('warning', 'critical');
  timerBadge.classList.remove('visible');
  timerBadge.textContent = '';
  document.getElementById('sessionTimer').setAttribute('aria-label', 'Session time elapsed');
  timerValue.textContent = fmt(proElapsedSeconds);
  timerInterval = setInterval(proTick, 1000);
}

function showFatigueToast() {
  const toast = document.getElementById('fatigueToast');
  toast.hidden = false;
  announceToScreenReader('20 minutes in — fresh ears fade. Consider a short break.');
  setTimeout(() => { toast.hidden = true; }, 8000);
}
```

In `startSessionTimer()` add the Pro branch as the first action after `timerStarted = true;`:

```js
  if (currentTier === 'pro') { switchTimerToProMode(); return; }
```

Copy `proNudgeDue_pure` into `test-runner.html` (`// From js/timer.js`).

- [ ] **Step 4: Toast markup + CSS** in `index.html` (next to the wrap-up bar):

```html
<div id="fatigueToast" role="status" hidden>20 minutes in &mdash; fresh ears fade. Consider a short break.</div>
```

```css
#fatigueToast { position: fixed; bottom: 1rem; right: 1rem; background: var(--bg-panel, #1a1a1f); border: 1px solid var(--border, #333); border-radius: 8px; padding: 0.7rem 1rem; font-size: 0.85rem; color: var(--text-muted); z-index: 950; }
#fatigueToast[hidden] { display: none; }
```

- [ ] **Step 5: Remove the TEMP `switchTimerToProMode` stub** from `js/checkout.js`.

- [ ] **Step 6: Manual test** — as Pro (DevTools `currentTier='pro'` before starting): timer counts UP from 0:00, no warning colors, no gate at any point; buying Pro mid-gate flips the countdown to count-up seamlessly. Fatigue toast: temporarily set `proElapsedSeconds = 1195` in DevTools, watch it appear once at 20:00 and never again.

- [ ] **Step 7: Run the suite** — Expected: 120 passed, 0 failed.

- [ ] **Step 8: Commit**

```bash
git add js/timer.js js/app.js js/checkout.js index.html test-runner.html
git commit -m "feat: Pro timer — elapsed count-up with one 20-minute fatigue nudge (2 tests)"
```

---

### Task 9: Floor raise, changelog, experiment log, docs, QA sweep

**Files:**
- Modify: `.github/workflows/ci.yml`, `CHANGELOG.md`, `CLAUDE.md`
- Create: `docs/experiment-log.md`

**Interfaces:** none — documentation and gates.

- [ ] **Step 1: Measure and raise the floor** — run `node scripts/ci-run-tests.mjs` (or count in the browser): expected 120 passed. In `.github/workflows/ci.yml` set `EXPECTED_MIN: 120` and append to the header comment's floor log:

```
#   2026-07-30: 120 — +15 monetization-experiment tests (ENT-001..004,
#   GATE-001..009, PRO-001..002); TIM-001 updated for the 6:00 session.
```

If the measured count differs from 120, use the measured number — the floor must equal reality, and the delta line must say what it covers.

- [ ] **Step 2: CHANGELOG entry** (plain-language, user-facing, no ticket refs in top bullets — house style):

```markdown
## v1.2.0 — Session passes and a lifetime license

- Free sessions are now 6 minutes — a full blind test on fresh ears.
- When time's up you can add 10 more minutes ($5), go Pro forever ($19), or close out — closing always shows your reveal and notes first.
- Pro removes the timer for good and unlocks LUFS metering, lock-in reshuffle, and PDF reports. One payment, no subscription.
- Text export and unlimited new sessions stay free.
```

- [ ] **Step 3: Create `docs/experiment-log.md`** with the entry template and entry #1:

```markdown
# Monetization Experiment Log

Running, as-it-happens record for the FOIL case study. Every entry is written
the day it happens — never reconstructed. Numbers come from PostHog + the
Polar dashboard; decisions link their spec/ADR.

Template per entry: **Date — What happened / Why / Numbers (if any) / Screenshot (if UI)**

---

## 2026-07-30 — Experiment designed and specced

Chose degrade-nothing-except-the-clock: free drops 10:00 → 6:00 (raises gate
exposure — at 10:00 the gate would rarely fire), everything else free stays
free. Gate offers a $5 session extension (deliberate price anchor) against a
$19 lifetime license. Close-session routes through the reveal — the tool never
eats an unfinished blind test. No accounts: Polar license key + localStorage.
Spec: `docs/superpowers/specs/2026-07-30-monetization-experiment-design.md`.
```

- [ ] **Step 4: Update the project `CLAUDE.md`** — Status line (append "monetization experiment shipped <date>"), Key Files (add `js/config.js`, `js/analytics.js`, `js/entitlements.js`, `js/gate-modal.js`, `js/checkout.js`, `api/`, `checkout-success.html`), replace the "PAID_GATE Locations (currently all ungated)" section with the live gate description + env var list (`POLAR_*`, PostHog key location), and note the sandbox→production flip requirement.

- [ ] **Step 5: Full manual QA sweep** (spec §9 checklist) on the preview deploy, BOTH origins (blind-listen.vercel.app and foil.engineering/blindlisten — the second exercises CORS): gate at 0:00 · Esc/× dismiss · badge re-open · close on un-revealed → reveal → wrap-up → reload · close on revealed → immediate reload · extension purchase → +10:00 counts down → second gate at 0:00 · Pro purchase → count-up · reload keeps Pro · cleared storage + manual key entry → Pro · text export free at every point · keyboard: Space while gated re-opens modal, R still reveals · screen reader announcements fire · modal usable at 375px width.

- [ ] **Step 5b: Adversarial half-hour** (Watson as hostile user, on the preview deploy with DevTools; expected outcomes written BEFORE attacking): delete the modal node (expected: transport stays locked — the lock is `sessionGateActive()` state, not DOM) · restore `sessionSeconds = 500` and play (expected: plays, `gate_bypassed` fires once — leakage, measured) · forge `localStorage.bl_license` with a fake key (expected: Pro this load, background revalidation downgrades and clears it) · block `/api/*` requests (expected: purchases fail safely with the announcer message, nothing granted, app keeps working free) · block PostHog (expected: zero behavior change). Any outcome outside "leakage-only" — a broken purchase, stuck UI, or fake Pro surviving revalidation — is a release blocker. Write results into `docs/experiment-log.md` as the threat-model entry.

- [ ] **Step 5c: Cold-eyes hallway test** — 1–2 producer friends hit the gate unbriefed (use `?t=60` on the preview URL); record reactions verbatim, defer analysis (recorder mode). The gate moment's emotional tone is the experiment's top UX risk — this is the go/adjust input for modal copy before launch.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/ci.yml CHANGELOG.md CLAUDE.md docs/experiment-log.md
git commit -m "chore: floor 105->119, changelog v1.2.0, experiment log, project docs"
```

---

## Launch checklist (orchestrator + Watson, AFTER Watson's visual review — not a subagent task)

1. Watson visual review on the preview deploy (his gate — modal copy/styling tweaks land here).
2. Production Polar org + products + checkout links + token; flip `js/config.js` (`POLAR_ENV`, both links, `POSTHOG_KEY`) and Vercel env vars to production values in one commit.
3. Merge `watson/monetization-experiment` → `main` (= production deploy). Verify `.vercel/project.json` projectId first (project CLAUDE.md rule), then HTTP 200 + visual spot-check on both origins; run one real $5 + one real $19 purchase end-to-end (refund via Polar dashboard after).
4. Entry #2 in `docs/experiment-log.md` (launch date, production flip, screenshots).
5. Distribution beat (Watson picks channels), then `/close-out` (ADR status flip, Linear, HANDOFF).
