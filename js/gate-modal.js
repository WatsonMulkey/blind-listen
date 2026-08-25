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
  timer:  { title: "Time's up", body: 'Six minutes of blind listening is a full session — fresh ears fade fast. Keep going, or wrap up.' },
  lufs:   { title: "That's a Pro feature", body: 'LUFS, peak, and RMS metering come with the lifetime license.' },
  lockin: { title: "That's a Pro feature", body: 'Lock in a pick and reshuffle to test your consistency — a lifetime-license feature.' },
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

// TEMP until Task 4/7 land — replaced there, remove then.
if (typeof openCheckout === 'undefined') { window.openCheckout = (p) => console.warn('checkout not wired yet:', p); }
