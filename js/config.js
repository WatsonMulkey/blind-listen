// ─── Experiment Config ────────────────────────────────────────
// Monetization experiment (docs/superpowers/specs/2026-07-30-monetization-experiment-design.md).
// Values marked SANDBOX are swapped to production values at launch (Task 9) — never before.
const POLAR_ENV = 'sandbox';
const CHECKOUT_LINK_EXTEND = '';   // SANDBOX checkout link for the $5 Session Extension (from Polar dashboard)
const CHECKOUT_LINK_PRO = '';      // SANDBOX checkout link for the $19 lifetime Pro
const API_BASE = 'https://blind-listen.vercel.app/api';
const POSTHOG_KEY = '';            // empty = analytics disabled (dev default)
