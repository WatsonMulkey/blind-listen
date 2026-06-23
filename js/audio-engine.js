// ─── Audio Engine ─────────────────────────────────────────────

// FOI-526: single source for lazy audio-graph init (was duplicated verbatim in
// app.js processFiles + ui.js loadRefTrack).
function ensureAudioGraph() {
  if (audioCtx) return;
  audioCtx = new AudioContext();
  levelMatchGain = audioCtx.createGain();
  levelMatchGain.gain.value = 1.0;
  gainNode = audioCtx.createGain();
  gainNode.gain.value = volumeBar.value / 100;
  levelMatchGain.connect(gainNode);
  gainNode.connect(audioCtx.destination);
}

function play(fromTime = pausedAt) {
  if (isPlaying) stop();
  if (activeIndex < 0) {
    activeIndex = 0;
    updateButtons();
    if (waveformVisible) redrawActiveVisual();
  }

  const fileIdx = shuffleMap[activeIndex];
  const buffer = buffers[fileIdx];

  if (audioCtx.state === 'suspended') audioCtx.resume();

  sourceNode = audioCtx.createBufferSource();
  sourceNode.buffer = buffer;
  sourceNode.connect(levelMatchGain);

  // Apply level match gain for this mix
  if (levelMatchEnabled && mixGainOffsets[fileIdx] !== undefined) {
    levelMatchGain.gain.value = mixGainOffsets[fileIdx];
  } else {
    levelMatchGain.gain.value = 1.0;
  }

  // Loop support
  if (loopEnabled) {
    sourceNode.loop = true;
    sourceNode.loopStart = loopStart;
    sourceNode.loopEnd = loopEnd;
  }

  const clampedTime = Math.min(fromTime, buffer.duration);
  sourceNode.start(0, clampedTime);
  startedAt = audioCtx.currentTime - clampedTime;
  isPlaying = true;
  playBtn.innerHTML = '&#9646;&#9646;';
  playBtn.setAttribute('aria-label', 'Pause');

  sourceNode.onended = () => {
    if (isPlaying && !sourceNode?.loop) {
      isPlaying = false;
      pausedAt = 0;
      playBtn.innerHTML = '&#9654;';
      playBtn.setAttribute('aria-label', 'Play');
    }
  };

  tickSeek();
}

function pause() {
  pausedAt = getCurrentTime();
  stop();
}

function stop() {
  if (sourceNode) {
    sourceNode.onended = null;
    try { sourceNode.stop(); } catch (err) { console.warn('Audio stop:', err.message); }
    sourceNode.disconnect();
    sourceNode = null;
  }
  isPlaying = false;
  playBtn.innerHTML = '&#9654;';
  playBtn.setAttribute('aria-label', 'Play');
  if (animFrame) cancelAnimationFrame(animFrame);
}

// FOI-526: shared loop-wrap math (was duplicated in getCurrentTime + ui.js getCurrentTimeRef).
function wrapLoopTime(raw) {
  if (loopEnabled && loopEnd > loopStart && raw >= loopEnd) {
    const loopLen = loopEnd - loopStart;
    return loopStart + ((raw - loopStart) % loopLen);
  }
  return raw;
}

function getCurrentTime() {
  if (!isPlaying) return pausedAt;
  return wrapLoopTime(audioCtx.currentTime - startedAt);
}

function getActiveDuration() {
  if (activeIndex < 0) return duration;
  const fileIdx = shuffleMap[activeIndex];
  return buffers[fileIdx] ? buffers[fileIdx].duration : duration;
}

function getShortestDuration() {
  let shortest = Infinity;
  for (const idx of shuffleMap) {
    if (buffers[idx] && buffers[idx].duration < shortest) shortest = buffers[idx].duration;
  }
  return shortest === Infinity ? duration : shortest;
}

function tickSeek() {
  if (!isPlaying) return;
  const t = getCurrentTime();
  const dur = getActiveDuration();
  seekBar.value = (t / dur) * 1000;
  seekBar.setAttribute('aria-valuetext', `${fmt(t)} of ${fmt(dur)}`);
  updateSeekDisplay(t, dur);

  if (waveformVisible) {
    waveformPlayhead.style.left = (t / dur) * 100 + '%';
  }

  animFrame = requestAnimationFrame(tickSeek);
}

function updateSeekDisplay(t, dur) {
  const pct = dur > 0 ? (t / dur) * 100 : 0;
  seekBar.style.background = `linear-gradient(to right, var(--accent) 0%, var(--accent) ${pct}%, var(--border) ${pct}%, var(--border) 100%)`;
  timeElapsed.textContent = fmt(t);
  timeDuration.textContent = fmt(dur);
}
