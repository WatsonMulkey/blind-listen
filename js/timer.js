// ─── Session Timer ────────────────────────────────────────────

let lastAnnouncedThreshold = null;

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

function startSessionTimer() {
  if (timerStarted) return;
  timerStarted = true;
  // track() fires for BOTH tiers — the funnel wants session_start with tier
  // even for Pro (no countdown, but still a session). Pro branches to its
  // own count-up mode and returns before the countdown-specific display/
  // interval setup below.
  track('session_start', { tier: currentTier });
  if (currentTier === 'pro') { switchTimerToProMode(); return; }
  updateTimerDisplay();
  timerInterval = setInterval(sessionTick, 1000);
}

function resumeCountdown() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(sessionTick, 1000);
}

// ─── Pro timer: elapsed count-up + one-shot fatigue nudge (FOI-524) ────
// Pro has no session cap, so there's nothing to count down to — the timer
// counts UP from 0:00 instead, and the only "gate"-adjacent UX left is a
// single non-blocking fatigue nudge at the 20-minute mark (never repeats).

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

// Called both when a session STARTS already Pro (startSessionTimer) and when
// Pro is bought mid-gate (checkout.js activatePro) — in the latter case the
// countdown was already running, so this seeds proElapsedSeconds from
// whatever the free session had already burned rather than restarting at 0,
// giving a seamless countdown -> count-up handoff.
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

function updateTimerDisplay() {
  timerValue.textContent = fmt(sessionSeconds);
  timerValue.classList.remove('warning', 'critical');
  timerBadge.classList.remove('visible');
  timerBadge.textContent = '';

  if (sessionSeconds <= 0) {
    timerValue.classList.add('critical');
    timerBadge.textContent = 'Ended';
    timerBadge.classList.add('visible');
    if (lastAnnouncedThreshold !== 'ended') {
      announceToScreenReader('Session ended. Playback paused.');
      lastAnnouncedThreshold = 'ended';
    }
  } else if (sessionSeconds <= 30) {
    timerValue.classList.add('critical');
    if (lastAnnouncedThreshold !== 'critical') {
      announceToScreenReader('30 seconds remaining in session.');
      lastAnnouncedThreshold = 'critical';
    }
  } else if (sessionSeconds <= 120) {
    timerValue.classList.add('warning');
    timerBadge.textContent = 'Low';
    timerBadge.classList.add('visible');
    if (lastAnnouncedThreshold !== 'warning') {
      announceToScreenReader('2 minutes remaining in session.');
      track('timer_warning');
      lastAnnouncedThreshold = 'warning';
    }
  }
}

function announceToScreenReader(message) {
  const el = document.getElementById('srAnnouncer');
  if (!el) return;
  el.textContent = '';
  setTimeout(() => { el.textContent = message; }, 50);
}
