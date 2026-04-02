// ─── Session Timer ────────────────────────────────────────────

let lastAnnouncedThreshold = null;

function startSessionTimer() {
  if (timerStarted) return;
  timerStarted = true;
  updateTimerDisplay();
  timerInterval = setInterval(() => {
    sessionSeconds--;
    updateTimerDisplay();
    if (sessionSeconds <= 0) {
      clearInterval(timerInterval);
      sessionSeconds = 0;
      updateTimerDisplay();
      if (isPlaying) pause();
    }
  }, 1000);
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
