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
  track('session_start', { tier: currentTier });
  updateTimerDisplay();
  timerInterval = setInterval(sessionTick, 1000);
}

function resumeCountdown() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(sessionTick, 1000);
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
