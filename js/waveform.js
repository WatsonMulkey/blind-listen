// ─── Waveform + Spectrogram ───────────────────────────────────

function drawWaveform(buffer) {
  const dpr = window.devicePixelRatio || 1;
  const rect = waveformContainer.getBoundingClientRect();
  waveformCanvas.width = rect.width * dpr;
  waveformCanvas.height = rect.height * dpr;

  const ctx = waveformCanvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const data = buffer.getChannelData(0);
  const bars = Math.min(600, Math.floor(rect.width / 2));
  const step = Math.floor(data.length / bars);
  const barW = rect.width / bars;
  const mid = rect.height / 2;

  const peaks = new Float32Array(bars);
  for (let i = 0; i < bars; i++) {
    let max = 0;
    for (let j = i * step; j < (i + 1) * step && j < data.length; j++) {
      const abs = Math.abs(data[j]);
      if (abs > max) max = abs;
    }
    peaks[i] = max;
  }

  const styles = getComputedStyle(document.documentElement);

  ctx.fillStyle = styles.getPropertyValue('--waveform-fill').trim();
  for (let i = 0; i < bars; i++) {
    const h = peaks[i] * rect.height * 0.9;
    ctx.fillRect(i * barW, mid - h / 2, Math.max(barW - 1, 1), h);
  }

  ctx.strokeStyle = styles.getPropertyValue('--waveform-line').trim();
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < bars; i++) {
    const h = peaks[i] * rect.height * 0.9;
    const x = i * barW + barW / 2;
    if (i === 0) ctx.moveTo(x, mid - h / 2);
    else ctx.lineTo(x, mid - h / 2);
  }
  ctx.stroke();
}

// ─── Spectrogram (Web Worker FFT) ────────────────────────────

// Lazy singleton worker — created on first use via Blob URL (works on file://)
let _spectrogramWorker = null;
let _spectrogramPendingIdx = null; // bufferIdx currently being computed
const spectrogramLoading = document.getElementById('spectrogramLoading');

// Worker code as string — avoids file:// cross-origin worker restrictions
const SPECTROGRAM_WORKER_CODE = `
self.onmessage = function(e) {
  var data = e.data.channelData;
  var sr = e.data.sampleRate;
  var fftSize = e.data.fftSize;
  var hopSize = e.data.hopSize;
  var w = e.data.width;
  var h = e.data.height;
  var numFrames = Math.floor((data.length - fftSize) / hopSize);
  if (numFrames <= 0) { self.postMessage({ pixels: null, width: w, height: h }); return; }
  var hannWindow = new Float32Array(fftSize);
  for (var i = 0; i < fftSize; i++) hannWindow[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (fftSize - 1)));
  var minFreq = 20, maxFreq = Math.min(20000, sr / 2);
  var logMin = Math.log10(minFreq), logMax = Math.log10(maxFreq);
  var rowBins = new Float32Array(h);
  for (var y = 0; y < h; y++) { var frac = 1 - y / h; rowBins[y] = Math.pow(10, logMin + frac * (logMax - logMin)) * fftSize / sr; }
  var halfFFT = fftSize / 2;
  var magnitudes = new Float32Array(numFrames * halfFFT);
  var real = new Float32Array(fftSize), imag = new Float32Array(fftSize);
  for (var frame = 0; frame < numFrames; frame++) {
    var offset = frame * hopSize;
    for (var i = 0; i < fftSize; i++) { real[i] = (offset + i < data.length) ? data[offset + i] * hannWindow[i] : 0; imag[i] = 0; }
    for (var i = 1, j = 0; i < fftSize; i++) { var bit = fftSize >> 1; while (j & bit) { j ^= bit; bit >>= 1; } j ^= bit; if (i < j) { var tmp = real[i]; real[i] = real[j]; real[j] = tmp; tmp = imag[i]; imag[i] = imag[j]; imag[j] = tmp; } }
    for (var len = 2; len <= fftSize; len <<= 1) { var ang = -2 * Math.PI / len, wR = Math.cos(ang), wI = Math.sin(ang); for (var i = 0; i < fftSize; i += len) { var curR = 1, curI = 0; for (var j = 0; j < len / 2; j++) { var uR = real[i+j], uI = imag[i+j]; var vR = real[i+j+len/2]*curR - imag[i+j+len/2]*curI; var vI = real[i+j+len/2]*curI + imag[i+j+len/2]*curR; real[i+j] = uR+vR; imag[i+j] = uI+vI; real[i+j+len/2] = uR-vR; imag[i+j+len/2] = uI-vI; var newCurR = curR*wR - curI*wI; curI = curR*wI + curI*wR; curR = newCurR; } } }
    var base = frame * halfFFT;
    for (var i = 0; i < halfFFT; i++) { var mag = Math.sqrt(real[i]*real[i] + imag[i]*imag[i]); magnitudes[base+i] = mag > 0 ? 20*Math.log10(mag/fftSize) : -120; }
  }
  var pixels = new Uint8ClampedArray(w * h * 4);
  for (var x = 0; x < w; x++) {
    var frame = Math.floor(x / w * numFrames), base = frame * halfFFT;
    for (var y = 0; y < h; y++) {
      var bin = rowBins[y], binLow = Math.floor(bin), binHigh = Math.min(binLow+1, halfFFT-1), frac = bin - binLow;
      var dbVal = magnitudes[base+binLow]*(1-frac) + magnitudes[base+binHigh]*frac;
      var norm = Math.max(0, Math.min(1, (dbVal+100)/80));
      var idx = (y*w+x)*4;
      if (norm < 0.33) { var t = norm/0.33; pixels[idx]=Math.floor(10*(1-t)); pixels[idx+1]=Math.floor(10*(1-t)+80*t); pixels[idx+2]=Math.floor(60*(1-t)+160*t); }
      else if (norm < 0.66) { var t = (norm-0.33)/0.33; pixels[idx]=Math.floor(220*t); pixels[idx+1]=Math.floor(80+140*t); pixels[idx+2]=Math.floor(160*(1-t)); }
      else { var t = (norm-0.66)/0.34; pixels[idx]=Math.floor(220+35*t); pixels[idx+1]=Math.floor(220+35*t); pixels[idx+2]=Math.floor(180*t); }
      pixels[idx+3] = 255;
    }
  }
  self.postMessage({ pixels: pixels, width: w, height: h }, [pixels.buffer]);
};
`;

function _getSpectrogramWorker() {
  if (!_spectrogramWorker) {
    const blob = new Blob([SPECTROGRAM_WORKER_CODE], { type: 'application/javascript' });
    _spectrogramWorker = new Worker(URL.createObjectURL(blob));
  }
  return _spectrogramWorker;
}

// Clean up worker on page unload
window.addEventListener('beforeunload', () => {
  if (_spectrogramWorker) {
    _spectrogramWorker.terminate();
    _spectrogramWorker = null;
  }
});

function drawSpectrogram(buffer, bufferIdx) {
  const dpr = window.devicePixelRatio || 1;
  const rect = waveformContainer.getBoundingClientRect();
  const w = Math.floor(rect.width * dpr);
  const h = Math.floor(rect.height * dpr);

  spectrogramCanvas.width = w;
  spectrogramCanvas.height = h;

  const ctx = spectrogramCanvas.getContext('2d');

  // Check cache
  if (spectrogramCache.has(bufferIdx)) {
    ctx.putImageData(spectrogramCache.get(bufferIdx), 0, 0);
    spectrogramLoading.style.display = 'none';
    return;
  }

  // Show pulsing loading overlay
  spectrogramLoading.style.display = 'flex';

  // Prepare channel data for transfer
  const channelData = buffer.getChannelData(0);
  const fftSize = 2048;
  const hopSize = 512;

  // Copy the channel data so we can transfer it without detaching the AudioBuffer
  const channelCopy = new Float32Array(channelData.length);
  channelCopy.set(channelData);

  // Track which bufferIdx is pending so stale results can be discarded
  _spectrogramPendingIdx = bufferIdx;

  const worker = _getSpectrogramWorker();

  worker.onerror = function(e) {
    console.warn('Spectrogram worker error:', e.message);
    spectrogramLoading.style.display = 'none';
    _spectrogramPendingIdx = null;
  };

  // Set up one-shot handler for this computation
  worker.onmessage = function(e) {
    const result = e.data;

    // Discard if a newer request superseded this one
    if (_spectrogramPendingIdx !== bufferIdx) return;
    _spectrogramPendingIdx = null;
    spectrogramLoading.style.display = 'none';

    if (!result.pixels) return; // numFrames <= 0

    // Rebuild ImageData from the returned pixel array
    const imgData = ctx.createImageData(result.width, result.height);
    imgData.data.set(new Uint8ClampedArray(result.pixels));
    ctx.putImageData(imgData, 0, 0);
    spectrogramCache.set(bufferIdx, imgData);
  };

  // Post to worker — transfer the Float32Array buffer for zero-copy
  worker.postMessage({
    channelData: channelCopy,
    sampleRate: buffer.sampleRate,
    fftSize: fftSize,
    hopSize: hopSize,
    width: w,
    height: h
  }, [channelCopy.buffer]);
}

function redrawActiveVisual() {
  if (activeIndex < 0 && !refActive) return;
  const fileIdx = refActive ? -1 : shuffleMap[activeIndex];
  const buf = refActive ? refBuffer : buffers[fileIdx];
  if (!buf) return;
  if (spectrogramMode) {
    drawSpectrogram(buf, refActive ? 'ref' : fileIdx);
  } else {
    drawWaveform(buf);
  }
}

// Toggle waveform visibility
waveformToggle.addEventListener('click', () => {
  waveformVisible = !waveformVisible;
  waveformContainer.classList.toggle('hidden', !waveformVisible);
  waveformContainer.setAttribute('aria-hidden', String(!waveformVisible));
  waveformToggle.textContent = waveformVisible ? 'Hide' : 'Show';
  waveformToggle.setAttribute('aria-pressed', String(waveformVisible));
  waveformToggle.classList.toggle('active', waveformVisible);

  if (waveformVisible) {
    redrawActiveVisual();
    if (loopEnabled) {
      loopRegion.style.display = 'block';
      loopStartMarker.style.display = 'flex';
      loopEndMarker.style.display = 'flex';
      updateLoopMarkers();
    }
  }
});

// Toggle spectrogram mode
spectrogramToggle.addEventListener('click', () => {
  spectrogramMode = !spectrogramMode;
  spectrogramToggle.classList.toggle('active', spectrogramMode);
  spectrogramToggle.setAttribute('aria-pressed', String(spectrogramMode));
  waveformLabel.textContent = spectrogramMode ? 'Spectrogram' : 'Waveform';

  // Toggle canvas visibility
  waveformCanvas.style.display = spectrogramMode ? 'none' : 'block';
  spectrogramCanvas.style.display = spectrogramMode ? 'block' : 'none';

  if (waveformVisible) redrawActiveVisual();
});

// Debounced canvas resize
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (waveformVisible) {
      spectrogramCache.clear(); // Invalidate on resize
      redrawActiveVisual();
    }
  }, 200);
});

// Click-to-seek on waveform
waveformContainer.addEventListener('click', (e) => {
  if (e.target.classList.contains('loop-marker-handle')) return;
  if (activeIndex < 0 && !refActive) return;

  const rect = waveformContainer.getBoundingClientRect();
  const dur = refActive ? refBuffer.duration : getActiveDuration();
  let pct = (e.clientX - rect.left) / rect.width;
  pct = Math.max(0, Math.min(1, pct));
  const time = pct * dur;

  if (isPlaying) {
    stop();
    if (refActive) playRef(time);
    else play(time);
  } else {
    pausedAt = time;
    updateSeekDisplay(time, dur);
    seekBar.value = (time / dur) * 1000;
    waveformPlayhead.style.left = pct * 100 + '%';
  }
});
