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
