// ─── Waveform + Spectrogram ───────────────────────────────────

function drawWaveform(buffer) {
  const dpr = window.devicePixelRatio || 1;
  const rect = waveformContainer.getBoundingClientRect();
  waveformCanvas.width = rect.width * dpr;
  waveformCanvas.height = rect.height * dpr;
  waveformCanvas.style.width = rect.width + 'px';
  waveformCanvas.style.height = rect.height + 'px';

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

// ─── Spectrogram (radix-2 FFT) ───────────────────────────────

function drawSpectrogram(buffer, bufferIdx) {
  const dpr = window.devicePixelRatio || 1;
  const rect = waveformContainer.getBoundingClientRect();
  const w = Math.floor(rect.width * dpr);
  const h = Math.floor(rect.height * dpr);

  spectrogramCanvas.width = w;
  spectrogramCanvas.height = h;
  spectrogramCanvas.style.width = rect.width + 'px';
  spectrogramCanvas.style.height = rect.height + 'px';

  const ctx = spectrogramCanvas.getContext('2d');

  // Check cache
  if (spectrogramCache.has(bufferIdx)) {
    ctx.putImageData(spectrogramCache.get(bufferIdx), 0, 0);
    return;
  }

  // Compute spectrogram
  const data = buffer.getChannelData(0);
  const sr = buffer.sampleRate;
  const fftSize = 2048;
  const hopSize = 512;
  const numFrames = Math.floor((data.length - fftSize) / hopSize);
  if (numFrames <= 0) return;

  // Pre-compute Hann window
  const window = new Float32Array(fftSize);
  for (let i = 0; i < fftSize; i++) {
    window[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (fftSize - 1)));
  }

  // Log frequency mapping (20Hz to 20kHz)
  const minFreq = 20;
  const maxFreq = Math.min(20000, sr / 2);
  const logMin = Math.log10(minFreq);
  const logMax = Math.log10(maxFreq);
  const binToFreq = (bin) => bin * sr / fftSize;

  // Map each pixel row to a frequency bin
  const rowFreqs = new Float32Array(h);
  const rowBins = new Float32Array(h);
  for (let y = 0; y < h; y++) {
    const frac = 1 - y / h; // bottom = low freq
    const freq = Math.pow(10, logMin + frac * (logMax - logMin));
    rowFreqs[y] = freq;
    rowBins[y] = freq * fftSize / sr;
  }

  // Compute all FFT frames
  const halfFFT = fftSize / 2;
  const magnitudes = new Float32Array(numFrames * halfFFT);

  // Inline radix-2 FFT
  const real = new Float32Array(fftSize);
  const imag = new Float32Array(fftSize);

  for (let frame = 0; frame < numFrames; frame++) {
    const offset = frame * hopSize;

    // Apply window and prepare FFT input
    for (let i = 0; i < fftSize; i++) {
      real[i] = (offset + i < data.length) ? data[offset + i] * window[i] : 0;
      imag[i] = 0;
    }

    // Bit-reversal permutation
    for (let i = 1, j = 0; i < fftSize; i++) {
      let bit = fftSize >> 1;
      while (j & bit) { j ^= bit; bit >>= 1; }
      j ^= bit;
      if (i < j) {
        let tmp = real[i]; real[i] = real[j]; real[j] = tmp;
        tmp = imag[i]; imag[i] = imag[j]; imag[j] = tmp;
      }
    }

    // FFT butterfly
    for (let len = 2; len <= fftSize; len <<= 1) {
      const ang = -2 * Math.PI / len;
      const wR = Math.cos(ang);
      const wI = Math.sin(ang);
      for (let i = 0; i < fftSize; i += len) {
        let curR = 1, curI = 0;
        for (let j = 0; j < len / 2; j++) {
          const uR = real[i + j];
          const uI = imag[i + j];
          const vR = real[i + j + len / 2] * curR - imag[i + j + len / 2] * curI;
          const vI = real[i + j + len / 2] * curI + imag[i + j + len / 2] * curR;
          real[i + j] = uR + vR;
          imag[i + j] = uI + vI;
          real[i + j + len / 2] = uR - vR;
          imag[i + j + len / 2] = uI - vI;
          const newCurR = curR * wR - curI * wI;
          curI = curR * wI + curI * wR;
          curR = newCurR;
        }
      }
    }

    // Store magnitudes (dB)
    const base = frame * halfFFT;
    for (let i = 0; i < halfFFT; i++) {
      const mag = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
      magnitudes[base + i] = mag > 0 ? 20 * Math.log10(mag / fftSize) : -120;
    }
  }

  // Render to ImageData
  const imgData = ctx.createImageData(w, h);
  const pixels = imgData.data;

  for (let x = 0; x < w; x++) {
    const frame = Math.floor(x / w * numFrames);
    const base = frame * halfFFT;
    for (let y = 0; y < h; y++) {
      const bin = rowBins[y];
      const binLow = Math.floor(bin);
      const binHigh = Math.min(binLow + 1, halfFFT - 1);
      const frac = bin - binLow;
      const dbVal = magnitudes[base + binLow] * (1 - frac) + magnitudes[base + binHigh] * frac;

      // Map dB to color: -100dB = dark blue, -20dB = bright yellow
      const norm = Math.max(0, Math.min(1, (dbVal + 100) / 80));
      const idx = (y * w + x) * 4;
      // Dark blue → cyan → yellow → white
      if (norm < 0.33) {
        const t = norm / 0.33;
        pixels[idx]     = Math.floor(10 * (1 - t) + 0 * t);   // R
        pixels[idx + 1] = Math.floor(10 * (1 - t) + 80 * t);  // G
        pixels[idx + 2] = Math.floor(60 * (1 - t) + 160 * t); // B
      } else if (norm < 0.66) {
        const t = (norm - 0.33) / 0.33;
        pixels[idx]     = Math.floor(0 + 220 * t);     // R
        pixels[idx + 1] = Math.floor(80 + 140 * t);    // G
        pixels[idx + 2] = Math.floor(160 * (1 - t));    // B
      } else {
        const t = (norm - 0.66) / 0.34;
        pixels[idx]     = Math.floor(220 + 35 * t);    // R
        pixels[idx + 1] = Math.floor(220 + 35 * t);    // G
        pixels[idx + 2] = Math.floor(0 + 180 * t);     // B
      }
      pixels[idx + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  spectrogramCache.set(bufferIdx, imgData);
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
