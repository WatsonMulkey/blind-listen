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
// whichever deploy the page itself is being served from.
const API_BASE = location.hostname === 'foil.engineering'
  ? 'https://blind-listen.vercel.app/api'
  : '/api';
const POSTHOG_KEY = '';            // empty = analytics disabled (dev default)
