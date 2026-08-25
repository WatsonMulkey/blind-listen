// ─── Analytics ────────────────────────────────────────────────
// Thin wrapper: no-ops when PostHog is absent (dev, adblock, empty key),
// so no call site ever needs a guard.
function track(name, props) {
  try {
    if (window.posthog && typeof posthog.capture === 'function') posthog.capture(name, props || {});
    // Dev-only visibility: POSTHOG_KEY empty means analytics is disabled
    // (dev default), so this is the only place events are observable at
    // all. When a real key is set (production), stay quiet — logging every
    // event to the console in production is noise, not a dev aid.
    if (!POSTHOG_KEY) console.debug('[track]', name, props || {});
  } catch (e) { /* analytics must never break the app */ }
}
