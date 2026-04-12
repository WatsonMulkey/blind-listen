// Onboarding overlay — shows once for first-time visitors
// Re-openable via the "?" help button

(function () {
  const STORAGE_KEY = 'blind-listen-onboarding-seen';
  const overlay = document.getElementById('onboardingOverlay');
  const closeBtn = document.getElementById('onboardingClose');
  const startBtn = document.getElementById('onboardingStart');
  const helpBtn = document.getElementById('helpBtn');

  function show() {
    overlay.hidden = false;
    closeBtn.focus();
  }

  function dismiss() {
    overlay.hidden = true;
    localStorage.setItem(STORAGE_KEY, '1');
    helpBtn.focus();
  }

  // First visit check
  if (!localStorage.getItem(STORAGE_KEY)) {
    show();
  }

  closeBtn.addEventListener('click', dismiss);
  startBtn.addEventListener('click', dismiss);

  // Close on backdrop click
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) dismiss();
  });

  // Close on Escape
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !overlay.hidden) dismiss();
  });

  // Help button re-opens
  helpBtn.addEventListener('click', show);
})();
