// ─── Checkout & Grants ────────────────────────────────────────
// Checkout opens in a NEW TAB (the session page must never unload — decoded
// AudioBuffers die with it, spec §4). The success page sends the checkout id
// back to this tab; we verify server-side before granting anything.
//
// CONTROLLER RULING E (2026-08-24): the app is served at BOTH
// blind-listen.vercel.app AND foil.engineering/blindlisten (a Vercel-rewrite
// proxy, different origin). checkout-success.html is deployed only at
// blind-listen.vercel.app, so when this tab is a foil.engineering tab, a
// BroadcastChannel from the success page (BroadcastChannel is strictly
// same-origin) never reaches it. window.open() below is therefore
// deliberately called WITHOUT 'noopener' so the success tab keeps a
// window.opener handle back to this tab and can also reach it via
// postMessage. This is an accepted, documented tradeoff (relaxed opener
// isolation for a payment-adjacent new-tab link) — it's safe because no
// grant is ever trusted from the messaging channel alone: every checkoutId,
// from either channel, is verified server-side (GET /checkout-status)
// before anything is granted.
function openCheckout(product) {
  const url = product === 'extend' ? CHECKOUT_LINK_EXTEND : CHECKOUT_LINK_PRO;
  if (!url) { console.warn('checkout link not configured for', product); return; }
  track('checkout_opened', { product });
  window.open(url, '_blank');
}

// FIX ROUND 1 (2026-08-25) — Task review finding: the original guard added
// checkoutId to processedCheckoutIds BEFORE the response was evaluated and
// never removed it. Task 6's checkout-status maps Polar's 'confirmed'
// ("user clicked Pay, still processing") to 'open', and returns 502 when
// Polar is unreachable — so a first check landing on either PERMANENTLY
// poisoned that checkoutId for the page session. Dual-channel redelivery
// can't help: it lands inside the same guard. For Pro the buyer can recover
// via "Enter license key"; for Extend it was a lost $5 with no path back.
//
// Fix: only a TERMINAL outcome (succeeded -> granted; expired -> dead) is
// permanent. 'open' gets a bounded internal retry (Polar's 'confirmed'
// resolves on its own within seconds — no user action needed). A 502/
// network failure is never poisoned at all — the id stays retryable via
// a fresh delivery (the user clicking "Add 10 minutes" again re-checks the
// same id since the button re-opens the same still-open checkout tab, or a
// duplicate BroadcastChannel/postMessage delivery of the same id).
const processedCheckoutIds = new Set();

// Short-lived in-flight lock, separate from processedCheckoutIds — added at
// the start of a check, released in `finally`. Guards the TRUE concurrent-
// duplicate race (both channels firing for the same id in the same tick,
// before either fetch resolves) without permanently poisoning a
// non-terminal id the way processedCheckoutIds does.
const inFlightCheckoutIds = new Set();

const OPEN_RETRY_DELAY_MS = 3000;
const OPEN_RETRY_MAX_ATTEMPTS = 5;

async function verifyCheckout(checkoutId, attempt = 0) {
  if (!checkoutId || processedCheckoutIds.has(checkoutId) || inFlightCheckoutIds.has(checkoutId)) return;
  inFlightCheckoutIds.add(checkoutId);
  try {
    const r = await fetch(`${API_BASE}/checkout-status?id=${encodeURIComponent(checkoutId)}`);
    if (!r.ok) throw new Error(`status ${r.status}`);
    const data = await r.json();

    if (data.status === 'expired') {
      processedCheckoutIds.add(checkoutId);   // terminal — dead, never retry
      return;
    }
    if (data.status !== 'succeeded') {
      // 'open' — includes Polar's 'confirmed' (payment mid-processing, not
      // yet a final answer). NOT terminal: bounded retry instead of poisoning.
      if (attempt < OPEN_RETRY_MAX_ATTEMPTS) {
        setTimeout(() => verifyCheckout(checkoutId, attempt + 1), OPEN_RETRY_DELAY_MS);
      } else {
        // "Add 10 minutes again" doesn't apply to a Pro purchase — Pro has no
        // repeatable button to re-click, so point it at the license-key path.
        announceToScreenReader(
          data.product === 'pro'
            ? 'Payment still processing — if it completes, use Enter license key to activate Pro.'
            : 'Payment still processing — if it completes, click Add 10 minutes again or use Enter license key.'
        );
      }
      return;
    }

    processedCheckoutIds.add(checkoutId);   // terminal — succeeded, grant now
    track('checkout_completed', { product: data.product });
    if (data.product === 'extend') grantExtension();
    if (data.product === 'pro') {
      if (data.licenseKey) activatePro(data.licenseKey);
      else promptLicenseEntry('Payment confirmed — paste the license key from your email to activate Pro.');
    }
  } catch (err) {
    // 502 / network failure: do NOT poison — leave the id retryable, and, like
    // the 'open' branch above, schedule a bounded auto-retry.
    //
    // FIX (2026-08-25, adversarial pre-launch audit): the original catch only
    // announced and scheduled NO retry (only 'open' retried). So a checkout that
    // SUCCEEDED at Polar but whose verify happened to land during a transient
    // Polar/network blip was silently lost: grantExtension never ran, the gate
    // stayed up, and — because an extend carries no license key — the manual
    // "Enter license key" path couldn't recover it either. The only visible
    // recourse, clicking "Add 10 minutes" again, opens a FRESH Polar checkout =
    // a second $5 charge (money-in / nothing-out, then a re-charge). A bounded
    // retry lets a transient failure self-heal before the buyer sees anything.
    // Still safe against double-grant: a 502/throw never adds the id to
    // processedCheckoutIds, and the processed/in-flight guards at the top of
    // verifyCheckout collapse any concurrent or post-grant re-entry to one grant.
    console.warn('checkout verification failed:', err.message);
    if (attempt < OPEN_RETRY_MAX_ATTEMPTS) {
      setTimeout(() => verifyCheckout(checkoutId, attempt + 1), OPEN_RETRY_DELAY_MS);
    } else {
      announceToScreenReader('Purchase verification failed — if you paid, use Enter license key or add minutes again.');
    }
  } finally {
    inFlightCheckoutIds.delete(checkoutId);
  }
}

// Unguarded, this constructor throws on browsers without BroadcastChannel
// support and kills the whole script — taking Pro restoration, manual
// license entry, and the postMessage fallback down with it. Guarded here so
// the rest of the file works with checkoutChannel simply absent; the
// postMessage listener below (and checkout-success.html's own try/catch
// around its BroadcastChannel) still covers grant delivery.
let checkoutChannel = null;
try {
  checkoutChannel = new BroadcastChannel('bl-checkout');
  checkoutChannel.onmessage = (e) => {
    const checkoutId = e.data && e.data.checkoutId;
    verifyCheckout(checkoutId);
  };
} catch (e) {
  console.warn('BroadcastChannel unavailable:', e.message);
}

// CONTROLLER RULING E: cross-origin fallback for a foil.engineering app tab —
// checkout-success.html always lands on blind-listen.vercel.app, so this is
// the only path that reaches a tab opened from the other origin. Any page
// (not just our own success page) can attempt to postMessage into this
// listener, so event.origin MUST be validated before event.data is trusted —
// verifyCheckout() is only reached for messages that actually came from the
// success page's real origin.
window.addEventListener('message', (e) => {
  if (e.origin !== 'https://blind-listen.vercel.app') return;
  const checkoutId = e.data && e.data.checkoutId;
  verifyCheckout(checkoutId);
});

function grantExtension() {
  sessionSeconds = applyExtension_pure(sessionSeconds);
  timerEndedOnce = false;   // verified grant — re-arms the gate AND the bypass telemetry
  hideGateModal();
  updateTimerDisplay();
  // Guarded: a bounded internal retry (verifyCheckout) or a redelivered
  // BroadcastChannel/postMessage can resolve after the user has hit Restart
  // (timerStarted reset to false) — resumeCountdown() would otherwise start
  // a ticking interval for a session that was never (re-)started.
  if (timerStarted) resumeCountdown();
  announceToScreenReader('10 minutes added to your session.');
}

function activatePro(key) {
  storeLicense(key);
  currentTier = 'pro';
  hideGateModal();
  track('license_activated');
  switchTimerToProMode();       // js/timer.js — flips countdown to Pro count-up
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
    // Keep the timer in sync with the tier flip. Belt-and-suspenders here
    // (this branch runs synchronously before any session can plausibly have
    // started) — the real race is the awaited branch below, where the fetch
    // gives a countdown time to start before currentTier resolves.
    if (timerStarted) switchTimerToProMode();
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
    // This branch is the real-world race: the fetch above takes a round
    // trip, during which the user can click "Start listening" and have a
    // countdown running by the time the await resolves and currentTier
    // flips to pro — so the timer switch has to travel with it here too.
    if (data && data.valid) { storeLicense(stored.key); currentTier = 'pro'; if (timerStarted) switchTimerToProMode(); }
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

// Quiet footer link — covers new browsers and any auto-retrieval miss.
document.getElementById('licenseEntryLink').addEventListener('click', () => promptLicenseEntry());
