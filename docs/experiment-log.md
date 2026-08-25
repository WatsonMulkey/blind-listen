# Monetization Experiment Log

Running, as-it-happens record for the FOIL case study. Every entry is written
the day it happens — never reconstructed. Numbers come from PostHog + the
Polar dashboard; decisions link their spec/ADR.

Template per entry: **Date — What happened / Why / Numbers (if any) / Screenshot (if UI)**

---

## 2026-08-25 (later) — Polar sandbox live; server chain verified end-to-end

Sandbox org **FOIL Engineering** (`0e21426a-bbf9-4fbb-a87d-8c283f9f5e9b`)
configured in one sitting: both one-time products (Session Extension $5
`1cb827b5-dab0-4725-ac8e-34cd02b969a0`; Blind Listen Pro (Lifetime) $19
`4a727ed1-b10f-41dd-a106-8d4c40ad74a7` with a License Keys benefit, prefix
`BLPRO`, no expiry/activation caps), both checkout links, and a 90-day
all-scopes org token. All five Vercel env vars set (Production + Preview);
sandbox checkout links committed to `js/config.js` @ `24e34c7`.

**Live curl battery against the preview deploy (Ruling D deferred
verification) — all pass:** `checkout-status` 400 on missing id, 502
`polar unreachable` on bogus id (retryable, by design); `validate-license`
**200 `{"valid":false}` on a bogus key** — this one proves the whole server
chain (function → sandbox Polar → org-token auth → invalid-key mapping;
a broken token would read `502 polar 401`). Method guards 405; CORS
preflight 204 with correct ACAO + `Vary: Origin` for a rostered origin.
That also retires the third named E2E scenario (the 404/400/403/422 →
`{valid:false}` mapping against the live org-scoped endpoint).

**Vercel Authentication disabled for the project** (Watson's call, offered
with alternatives): previews were SSO-locked, which blocked the E2E, the QA
sweep, and above all the unbriefed hallway testers. Repo and app are public;
the Polar token stays server-side regardless. Can be re-enabled any time.

⚠ **TEMPORARY, flip back at merge:** both sandbox checkout links' success
URL now points at the branch preview alias
(`blind-listen-git-watson-moneti-2a6dcd-watsons-projects-00a90c38.vercel.app/checkout-success.html?checkout_id={CHECKOUT_ID}`)
because prod (`main`) doesn't serve `checkout-success.html` yet — a purchase
would 404. The alias DIES when the branch is deleted post-merge, so at merge
time, **before** the 3-origin QA sweep, set both success URLs back to
`https://blind-listen.vercel.app/checkout-success.html?checkout_id={CHECKOUT_ID}`
(or FOI-713's canonical URL if Stage A ran first — then js/checkout.js's
`e.origin` check changes in the same breath, see the SDD ledger note).

Remaining before merge: same-origin E2E purchases on the preview (extend +
Pro incl. license activation), ref-at-0:00 real-deploy check, Watson's
adversarial half-hour, hallway test, visual review. PostHog key still unset.

## 2026-07-30 — Experiment designed and specced

Chose degrade-nothing-except-the-clock: free drops 10:00 → 6:00 (raises gate
exposure — at 10:00 the gate would rarely fire), everything else free stays
free. Gate offers a $5 session extension (deliberate price anchor) against a
$19 lifetime license. Close-session routes through the reveal — the tool never
eats an unfinished blind test. No accounts: Polar license key + localStorage.
Spec: `docs/superpowers/specs/2026-07-30-monetization-experiment-design.md`.

## 2026-08-25 — Built (Tasks 1–8)

Shipped the full experiment on `watson/monetization-experiment`: session
clock down to 6:00, the gate modal (timer + feature triggers), Pro/free
feature gates (LUFS metering, lock-in reshuffle, PDF export), Polar checkout
functions + client-side checkout with cross-origin dual-channel delivery
(BroadcastChannel same-origin, postMessage fallback for the
foil.engineering-proxied tab), and the Pro count-up timer replacing the free
countdown. Review caught two real defects and fixed both: a light-theme
token bug (the gate modal/wrap-up bar referenced a placeholder `--bg-panel`
variable instead of the site's real `--bg-surface` token, so they picked up
the wrong panel color in light mode — fixed in `44a65d7`) and a
checkout-verification bug where a `processing` or momentarily-unreachable
first response permanently poisoned a `checkoutId`, silently eating a $5
grant with no recovery path — fixed in `79c9e9b` by only treating terminal
outcomes (`succeeded`/`expired`) as permanent and giving non-terminal/
network-failure responses a bounded retry.

**Pending pre-launch** (deferred — need a preview deploy + Watson's Polar
sandbox + Watson himself, not done in this pass):
- Production Polar sandbox config (org/products/checkout links/token) + a
  live `curl` smoke test against `checkout-status`/`validate-license`.
- Full manual QA sweep on the preview deploy, across all THREE production
  origins (blind-listen.vercel.app, foil.engineering/blindlisten, and
  blindlisten.foil.engineering — a domain alias on the same Vercel project,
  verified 2026-08-24 to serve byte-identical content but still a distinct
  origin for CORS/postMessage purposes) per spec §9.
- Three named E2E scenarios still owed against a real deploy (the final-review
  fix wave covered the client-side logic with stubs; these need the real
  network path):
  - A cross-origin **extend** purchase, end to end, repeated against EACH of
    the three production origins (blind-listen.vercel.app,
    foil.engineering/blindlisten, and blindlisten.foil.engineering). This is
    the single delivery thread that matters for the two proxied/aliased
    origins — Controller Ruling E depends on `window.opener` surviving the
    new-tab checkout, and that can only be proven against a real cross-origin
    `window.open()` + Polar redirect, not a stub. `blind-listen.vercel.app`
    itself is same-origin (BroadcastChannel covers it); the other two rely on
    the postMessage fallback, which now targets all three explicit origins.
  - Ref-track-playing-at-0:00 regression check (the fix in `js/timer.js`
    `sessionTick`/`stopRefSource()`) — confirm on a real deploy that a
    playing reference track actually goes silent at the gate, not just that
    the assertion passes against the local harness.
  - The 403 branch on `api/validate-license.mjs` — the status-code mapping
    (404/400/403/422 → `{valid:false}`) is carried over from the brief and
    not independently confirmed against Polar's live org-scoped endpoint
    (see the RISK NOTE in that file); needs a real invalid-key call once
    sandbox credentials exist.
- Adversarial half-hour (Watson as hostile user, DevTools, expected outcomes
  written before attacking) — threat-model results go here as their own
  entry.
- Cold-eyes hallway test (1–2 producer friends, unbriefed, `?t=60`) —
  recorder mode, verbatim reactions.
- Watson's visual review of the gate modal/copy/styling on the preview
  deploy.
- Before flipping `POSTHOG_KEY` to a real key at launch: manually eyeball
  the current PostHog snippet at posthog.com/docs before setting it — the
  loader was prefix-verified only, not confirmed against the live snippet.
- Date the v1.2.0 `CHANGELOG.md` entry at launch — it currently has no date
  (every other entry does) because the build spanned multiple days; stamp it
  with the actual ship date when the sandbox→production flip happens.
