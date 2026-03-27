// ─── UI Assembly ──────────────────────────────────────────────

function buildUI() {
  mixButtons.innerHTML = '';
  noteRows.innerHTML = '';

  // Reference track button (before blind mixes)
  if (refBuffer || !refFile) {
    const refBtnEl = document.createElement('button');
    refBtnEl.className = 'ref-btn' + (refBuffer ? ' loaded' : '');
    refBtnEl.id = 'refBtn';
    if (refBuffer) {
      const name = refFile.name.replace(/\.[^.]+$/, '');
      refBtnEl.innerHTML = `<span class="ref-label">REF</span><span class="ref-name" title="${refFile.name}">${name}</span>`;
    } else {
      refBtnEl.innerHTML = `<span class="ref-label">REF</span><span style="font-size:0.65rem">+ Add</span>`;
    }
    refBtnEl.addEventListener('click', () => {
      if (!refBuffer) {
        // Trigger reference file upload
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = 'audio/*';
        inp.addEventListener('change', e => {
          if (e.target.files.length > 0) loadRefTrack(e.target.files[0]);
        });
        inp.click();
      } else {
        switchToRef();
      }
    });
    mixButtons.appendChild(refBtnEl);
  }

  for (let i = 0; i < shuffleMap.length; i++) {
    const wrapper = document.createElement('div');
    wrapper.className = 'mix-btn-wrapper';

    const btn = document.createElement('button');
    btn.className = 'mix-btn';
    btn.textContent = LABELS[i];
    btn.dataset.idx = i;
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', () => switchTo(i));
    wrapper.appendChild(btn);

    // Favorite button below each mix button
    const favBtn = document.createElement('button');
    favBtn.className = 'fav-btn' + (lockedBtnIndex === i ? ' favorited' : '');
    favBtn.textContent = lockedBtnIndex === i ? '\u2605' : '\u2606';
    favBtn.dataset.idx = i;
    favBtn.disabled = revealed;
    favBtn.addEventListener('click', () => toggleLock(i));
    wrapper.appendChild(favBtn);

    mixButtons.appendChild(wrapper);

    const row = document.createElement('div');
    row.className = 'note-row';
    row.innerHTML = `<span class="note-label">${LABELS[i]}</span><input class="note-input" placeholder="What do you hear?" data-idx="${i}" aria-label="Notes for Mix ${LABELS[i]}">`;
    noteRows.appendChild(row);
  }

  revealBtn.textContent = 'Reveal';
  revealBtn.disabled = false;
  consistencyResult.classList.remove('visible', 'match', 'differ');
  updateButtons();
  renderMixStats();
}

function toggleLock(btnIndex) {
  // PAID_GATE: lock-in reshuffle (ungated for now — all users get this)
  if (revealed) return;
  if (lockedBtnIndex === btnIndex) {
    // Unfavorite
    lockedBtnIndex = -1;
    lockedFileIndex = -1;
  } else {
    // Favorite this pick
    lockedBtnIndex = btnIndex;
    lockedFileIndex = shuffleMap[btnIndex];
    firstPickFileIndex = shuffleMap[btnIndex];
  }
  // Update favorite button visuals
  mixButtons.querySelectorAll('.fav-btn').forEach((btn, i) => {
    btn.classList.toggle('favorited', lockedBtnIndex === i);
    btn.textContent = lockedBtnIndex === i ? '\u2605' : '\u2606';
  });
}

function switchTo(btnIndex) {
  if (revealed) return;

  // Deactivate reference track if switching to blind mix
  if (refActive) deactivateRef();

  const currentTime = getCurrentTime();
  const wasPlaying = isPlaying;

  stop();
  activeIndex = btnIndex;
  updateButtons();

  const newDur = getActiveDuration();
  const clamped = Math.min(currentTime, newDur);

  if (loopEnabled) {
    const dur = getShortestDuration();
    loopEnd = Math.min(loopEnd, dur);
    loopStart = Math.min(loopStart, loopEnd - 5);
    if (loopStart < 0) loopStart = 0;
    loopStartInput.value = fmt(loopStart);
    loopEndInput.value = fmt(loopEnd);
    updateLoopHint();
  }

  if (waveformVisible) {
    redrawActiveVisual();
    if (loopEnabled) updateLoopMarkers();
  }

  if (wasPlaying) {
    play(clamped);
  } else {
    pausedAt = clamped;
    updateSeekDisplay(clamped, newDur);
  }
}

function switchToRef() {
  if (!refBuffer) return;
  const currentTime = getCurrentTime();
  const wasPlaying = isPlaying;
  stop();

  refActive = true;
  activeIndex = -1;
  updateButtons();

  // Highlight REF button
  const refBtnEl = document.getElementById('refBtn');
  if (refBtnEl) refBtnEl.classList.add('active');

  if (waveformVisible && refBuffer) drawWaveform(refBuffer);

  if (wasPlaying) {
    playRef(currentTime);
  } else {
    pausedAt = currentTime;
    updateSeekDisplay(currentTime, refBuffer.duration);
  }
}

function deactivateRef() {
  refActive = false;
  if (refSourceNode) {
    try { refSourceNode.stop(); } catch (e) {}
    refSourceNode.disconnect();
    refSourceNode = null;
  }
  const refBtnEl = document.getElementById('refBtn');
  if (refBtnEl) refBtnEl.classList.remove('active');
}

function playRef(fromTime = 0) {
  if (!refBuffer || !audioCtx) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();

  if (refSourceNode) {
    try { refSourceNode.stop(); } catch (e) {}
    refSourceNode.disconnect();
  }

  if (!refGainNode) {
    refGainNode = audioCtx.createGain();
    refGainNode.connect(gainNode);
  }

  refSourceNode = audioCtx.createBufferSource();
  refSourceNode.buffer = refBuffer;
  refSourceNode.connect(refGainNode);

  if (loopEnabled) {
    refSourceNode.loop = true;
    refSourceNode.loopStart = loopStart;
    refSourceNode.loopEnd = loopEnd;
  }

  const clamped = Math.min(fromTime, refBuffer.duration);
  refSourceNode.start(0, clamped);
  startedAt = audioCtx.currentTime - clamped;
  isPlaying = true;
  playBtn.innerHTML = '&#9646;&#9646;';
  playBtn.setAttribute('aria-label', 'Pause');
  tickSeekRef();
}

function tickSeekRef() {
  if (!isPlaying || !refActive) return;
  const t = getCurrentTimeRef();
  const dur = refBuffer.duration;
  seekBar.value = (t / dur) * 1000;
  updateSeekDisplay(t, dur);
  if (waveformVisible) {
    waveformPlayhead.style.left = (t / dur) * 100 + '%';
  }
  animFrame = requestAnimationFrame(tickSeekRef);
}

function getCurrentTimeRef() {
  if (!isPlaying) return pausedAt;
  const raw = audioCtx.currentTime - startedAt;
  if (loopEnabled && loopEnd > loopStart) {
    const loopLen = loopEnd - loopStart;
    if (raw >= loopEnd) return loopStart + ((raw - loopStart) % loopLen);
  }
  return raw;
}

async function loadRefTrack(file) {
  refFile = file;
  if (!audioCtx) {
    audioCtx = new AudioContext();
    levelMatchGain = audioCtx.createGain();
    levelMatchGain.gain.value = 1.0;
    gainNode = audioCtx.createGain();
    gainNode.gain.value = volumeBar.value / 100;
    levelMatchGain.connect(gainNode);
    gainNode.connect(audioCtx.destination);
  }
  try {
    const arr = await file.arrayBuffer();
    refBuffer = await audioCtx.decodeAudioData(arr);
    buildUI(); // Rebuild to show REF button with filename
  } catch (err) {
    console.warn('Ref track decode error:', err.message);
    refFile = null;
    refBuffer = null;
  }
}

function updateButtons() {
  mixButtons.querySelectorAll('.mix-btn').forEach((btn, i) => {
    const isActive = i === activeIndex && !refActive;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
  // REF button active state
  const refBtnEl = document.getElementById('refBtn');
  if (refBtnEl) refBtnEl.classList.toggle('active', refActive);
}

// ─── Transport controls ──────────────────────────────────────

playBtn.addEventListener('click', () => {
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  if (refActive) {
    if (isPlaying) {
      pausedAt = getCurrentTimeRef();
      if (refSourceNode) { try { refSourceNode.stop(); } catch (e) {} refSourceNode.disconnect(); refSourceNode = null; }
      isPlaying = false;
      playBtn.innerHTML = '&#9654;';
      playBtn.setAttribute('aria-label', 'Play');
    } else {
      playRef(pausedAt);
    }
    return;
  }
  if (isPlaying) pause();
  else play();
});

seekBar.addEventListener('input', () => {
  if (refActive && refBuffer) {
    const dur = refBuffer.duration;
    const t = (seekBar.value / 1000) * dur;
    updateSeekDisplay(t, dur);
    if (isPlaying) {
      if (refSourceNode) { try { refSourceNode.stop(); } catch (e) {} refSourceNode.disconnect(); refSourceNode = null; }
      isPlaying = false;
      playRef(t);
    } else {
      pausedAt = t;
    }
    return;
  }
  const dur = getActiveDuration();
  const t = (seekBar.value / 1000) * dur;
  updateSeekDisplay(t, dur);
  if (isPlaying) {
    stop();
    play(t);
  } else {
    pausedAt = t;
  }
});

volumeBar.addEventListener('input', () => {
  if (gainNode) gainNode.gain.value = volumeBar.value / 100;
});

// ─── Reveal ──────────────────────────────────────────────────

revealBtn.addEventListener('click', () => {
  if (revealed) return;
  revealed = true;
  revealBtn.textContent = 'Revealed!';
  revealBtn.disabled = true;

  mixButtons.querySelectorAll('.mix-btn').forEach((btn, i) => {
    const fileIdx = shuffleMap[i];
    const name = files[fileIdx].name.replace(/\.[^.]+$/, '');
    btn.classList.add('revealed');
    btn.textContent = `${LABELS[i]}\n${name}`;
    btn.style.whiteSpace = 'pre-line';
  });

  // Disable lock buttons
  mixButtons.querySelectorAll('.fav-btn').forEach(btn => { btn.disabled = true; });

  // Show export buttons after reveal
  showExportButtons();

  // Show consistency result if a lock was set
  if (firstPickFileIndex >= 0 && activeIndex >= 0) {
    const currentFileIndex = shuffleMap[activeIndex];
    const same = currentFileIndex === firstPickFileIndex;
    consistencyResult.textContent = same
      ? '\u2713 Consistent — you picked the same file both times!'
      : '\u2717 Different picks — first round vs. second round were different files';
    consistencyResult.classList.remove('match', 'differ');
    consistencyResult.classList.add('visible', same ? 'match' : 'differ');
  }
});

// ─── Reshuffle ───────────────────────────────────────────────

reshuffleBtn.addEventListener('click', () => {
  // Store the locked pick's file index before reshuffling
  if (lockedBtnIndex >= 0) {
    firstPickFileIndex = lockedFileIndex;
  }

  shuffle();
  activeIndex = -1;
  pausedAt = 0;
  seekBar.value = 0;
  updateSeekDisplay(0, duration);

  // Reset lock state (keep firstPickFileIndex for consistency check)
  lockedBtnIndex = -1;
  lockedFileIndex = -1;

  // Deactivate ref
  if (refActive) deactivateRef();

  loopEnabled = false;
  loopStart = 0;
  loopEnd = 0;
  loopToggle.classList.remove('active');
  loopControls.classList.remove('expanded');
  loopToggle.setAttribute('aria-pressed', 'false');
  loopBody.style.display = 'none';
  loopHint.style.display = 'none';
  loopRegion.style.display = 'none';
  loopStartMarker.style.display = 'none';
  loopEndMarker.style.display = 'none';
  seekLoopRegion.style.display = 'none';

  waveformVisible = true;
  waveformContainer.classList.remove('hidden');
  waveformToggle.textContent = 'Hide';
  waveformToggle.setAttribute('aria-pressed', 'true');
  waveformToggle.classList.add('active');

  buildUI();
});

// ─── Keyboard shortcuts ──────────────────────────────────────

document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  const readyCount = shuffleMap.length;
  if (e.code === 'Space') { e.preventDefault(); if (!playBtn.disabled) { playBtn.click(); } }
  if (e.key === '1' && readyCount >= 1) switchTo(0);
  if (e.key === '2' && readyCount >= 2) switchTo(1);
  if (e.key === '3' && readyCount >= 3) switchTo(2);
  if (e.key === '4' && readyCount >= 4) switchTo(3);
  if (e.key === '5' && readyCount >= 5) switchTo(4);
  if (e.key === '0' && refBuffer) switchToRef();
  if (e.key === 'ArrowLeft' && readyCount >= 1) { e.preventDefault(); switchTo((activeIndex - 1 + readyCount) % readyCount); }
  if (e.key === 'ArrowRight' && readyCount >= 1) { e.preventDefault(); switchTo((activeIndex + 1) % readyCount); }
  if (e.key.toLowerCase() === 'l') toggleLoop();
  if (e.key.toLowerCase() === 'm') toggleLevelMatch();
  if (e.key.toLowerCase() === 'r' && !revealed) revealBtn.click();
});

// ─── Warning dismiss ─────────────────────────────────────────

durationDismiss.addEventListener('click', () => {
  durationWarning.style.display = 'none';
  sessionStorage.setItem('durationWarningDismissed', '1');
});
