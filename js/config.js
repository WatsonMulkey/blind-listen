// ─── Experiment Config ────────────────────────────────────────
// Monetization experiment (docs/superpowers/specs/2026-07-30-monetization-experiment-design.md).
// Values marked SANDBOX are swapped to production values at launch (Task 9) — never before.
const POLAR_ENV = 'sandbox';
const CHECKOUT_LINK_EXTEND = '';   // SANDBOX checkout link for the $5 Session Extension (from Polar dashboard)
const CHECKOUT_LINK_PRO = '';      // SANDBOX checkout link for the $19 lifetime Pro
// The foil.engineering Vercel-rewrite proxy covers the page routes but NOT
// /api — those requests must go straight at the real deploy. Every other
// origin (production blind-listen.vercel.app AND every preview deploy) can
// use a same-origin relative path: no CORS, and it automatically tracks
// whichever deploy the page itself is being served from. This also covers
// blindlisten.foil.engineering, a domain alias on the SAME Vercel project
// (byte-identical content, verified 2026-08-24) — its hostname is neither
// 'foil.engineering' (that's the separate rewrite-proxy project) nor
// blind-listen.vercel.app itself, so the ternary below falls through to the
// relative '/api' branch, which resolves correctly because the alias and
// blind-listen.vercel.app are the same deploy.
const API_BASE = location.hostname === 'foil.engineering'
  ? 'https://blind-listen.vercel.app/api'
  : '/api';
const POSTHOG_KEY = '';            // empty = analytics disabled (dev default)
