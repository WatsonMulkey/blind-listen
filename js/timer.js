// ─── Session Timer ────────────────────────────────────────────

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
  } else if (sessionSeconds <= 30) {
    timerValue.classList.add('critical');
  } else if (sessionSeconds <= 120) {
    timerValue.classList.add('warning');
    timerBadge.textContent = 'Low';
    timerBadge.classList.add('visible');
  }
}
