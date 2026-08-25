// ─── Analytics ────────────────────────────────────────────────
// Thin wrapper: no-ops when PostHog is absent (dev, adblock, empty key),
// so no call site ever needs a guard.
function track(name, props) {
  try {
    if (window.posthog && typeof posthog.capture === 'function') posthog.capture(name, props || {});
  } catch (e) { /* analytics must never break the app */ }
  console.debug('[track]', name, props || {});
}
