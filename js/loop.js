// ─── Loop Controls ────────────────────────────────────────────

function toggleLoop() {
  loopEnabled = !loopEnabled;
  loopToggle.classList.toggle('active', loopEnabled);
  loopToggle.setAttribute('aria-pressed', String(loopEnabled));
  loopControls.classList.toggle('expanded', loopEnabled);
  loopBody.style.display = loopEnabled ? 'flex' : 'none';
  loopHint.style.display = loopEnabled ? 'block' : 'none';

  const markerDisplay = loopEnabled ? 'flex' : 'none';
  loopRegion.style.display = loopEnabled ? 'block' : 'none';
  loopStartMarker.style.display = markerDisplay;
  loopEndMarker.style.display = markerDisplay;
  seekLoopRegion.style.display = loopEnabled ? 'block' : 'none';

  if (loopEnabled && loopEnd === 0) {
    const dur = getShortestDuration();
    loopStart = 0;
    loopEnd = Math.min(dur, 30);
    if (loopEnd - loopStart < 5) loopEnd = Math.min(loopStart + 5, dur);
    updateLoopInputs();
    updateLoopMarkers();
    updateLoopHint();
  }

  if (isPlaying) {
    const t = getCurrentTime();
    stop();
    play(loopEnabled ? Math.max(loopStart, Math.min(t, loopEnd)) : t);
  }
}

function reroll() {
  const dur = getShortestDuration();
  const maxStart = Math.max(0, dur - 5);
  loopStart = Math.random() * maxStart;
  const maxLen = Math.min(60, dur - loopStart);
  const len = 5 + Math.random() * (maxLen - 5);
  loopEnd = Math.min(loopStart + len, dur);

  updateLoopInputs();
  updateLoopMarkers();
  updateLoopHint();

  if (isPlaying) {
    stop();
    play(loopStart);
  }
}

function updateLoopInputs() {
  loopStartInput.value = fmt(loopStart);
  loopEndInput.value = fmt(loopEnd);
}

function updateLoopMarkers() {
  const dur = getActiveDuration();
  if (dur <= 0) return;
  const startPct = (loopStart / dur) * 100;
  const endPct = (loopEnd / dur) * 100;
  loopRegion.style.left = startPct + '%';
  loopRegion.style.right = (100 - endPct) + '%';
  loopStartMarker.style.left = startPct + '%';
  loopEndMarker.style.left = endPct + '%';
  seekLoopRegion.style.left = startPct + '%';
  seekLoopRegion.style.width = (endPct - startPct) + '%';
}

function updateLoopHint() {
  if (!loopEnabled) return;
  const len = loopEnd - loopStart;
  loopHint.textContent = `${Math.round(len)}s loop \u00b7 Min 5s`;
}

loopToggle.addEventListener('click', toggleLoop);
rerollBtn.addEventListener('click', reroll);

loopStartInput.addEventListener('change', () => {
  const dur = getShortestDuration();
  let val = parseTime(loopStartInput.value);
  val = Math.max(0, Math.min(val, dur - 5));
  loopStart = val;
  if (loopEnd - loopStart < 5) loopEnd = Math.min(loopStart + 5, dur);
  updateLoopInputs();
  updateLoopMarkers();
  updateLoopHint();
  if (isPlaying) { stop(); play(loopStart); }
});

loopEndInput.addEventListener('change', () => {
  const dur = getShortestDuration();
  let val = parseTime(loopEndInput.value);
  val = Math.max(loopStart + 5, Math.min(val, dur));
  loopEnd = val;
  updateLoopInputs();
  updateLoopMarkers();
  updateLoopHint();
  if (isPlaying) { const t = getCurrentTime(); stop(); play(Math.min(t, loopEnd)); }
});

// Draggable loop markers on waveform
function setupMarkerDrag(marker, isStart) {
  let dragging = false;

  marker.addEventListener('mousedown', (e) => {
    e.preventDefault();
    dragging = true;
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', onUp);
  });

  marker.addEventListener('touchstart', (e) => {
    e.preventDefault();
    dragging = true;
    document.addEventListener('touchmove', onTouchDrag, { passive: false });
    document.addEventListener('touchend', onTouchUp);
  });

  function getTimeFromX(clientX) {
    const rect = waveformContainer.getBoundingClientRect();
    const dur = getActiveDuration();
    let pct = (clientX - rect.left) / rect.width;
    pct = Math.max(0, Math.min(1, pct));
    return pct * dur;
  }

  function applyTime(time) {
    const dur = getShortestDuration();
    if (isStart) {
      loopStart = Math.max(0, Math.min(time, loopEnd - 5, dur - 5));
    } else {
      loopEnd = Math.max(loopStart + 5, Math.min(time, dur));
    }
    updateLoopInputs();
    updateLoopMarkers();
    updateLoopHint();
  }

  function onDrag(e) { if (dragging) applyTime(getTimeFromX(e.clientX)); }
  function onTouchDrag(e) { if (dragging) { e.preventDefault(); applyTime(getTimeFromX(e.touches[0].clientX)); } }

  function onUp() {
    dragging = false;
    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('mouseup', onUp);
    if (isPlaying) { const t = getCurrentTime(); stop(); play(Math.max(loopStart, Math.min(t, loopEnd))); }
  }

  function onTouchUp() {
    dragging = false;
    document.removeEventListener('touchmove', onTouchDrag);
    document.removeEventListener('touchend', onTouchUp);
    if (isPlaying) { const t = getCurrentTime(); stop(); play(Math.max(loopStart, Math.min(t, loopEnd))); }
  }
}

setupMarkerDrag(loopStartMarker, true);
setupMarkerDrag(loopEndMarker, false);
