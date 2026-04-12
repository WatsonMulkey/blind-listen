// ─── Spectrogram Web Worker ─────────────────────────────────
// Offloads FFT computation from the main thread to prevent UI freezing.
// Accepts: { channelData, sampleRate, fftSize, hopSize, width, height }
// Returns: { pixels, width, height }

self.onmessage = function(e) {
  var data = e.data.channelData;
  var sr = e.data.sampleRate;
  var fftSize = e.data.fftSize;
  var hopSize = e.data.hopSize;
  var w = e.data.width;
  var h = e.data.height;

  var numFrames = Math.floor((data.length - fftSize) / hopSize);
  if (numFrames <= 0) {
    self.postMessage({ pixels: null, width: w, height: h });
    return;
  }

  // Pre-compute Hann window
  var hannWindow = new Float32Array(fftSize);
  for (var i = 0; i < fftSize; i++) {
    hannWindow[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (fftSize - 1)));
  }

  // Log frequency mapping (20Hz to 20kHz)
  var minFreq = 20;
  var maxFreq = Math.min(20000, sr / 2);
  var logMin = Math.log10(minFreq);
  var logMax = Math.log10(maxFreq);

  // Map each pixel row to a frequency bin
  var rowBins = new Float32Array(h);
  for (var y = 0; y < h; y++) {
    var frac = 1 - y / h; // bottom = low freq
    var freq = Math.pow(10, logMin + frac * (logMax - logMin));
    rowBins[y] = freq * fftSize / sr;
  }

  // Compute all FFT frames
  var halfFFT = fftSize / 2;
  var magnitudes = new Float32Array(numFrames * halfFFT);

  // Inline radix-2 FFT
  var real = new Float32Array(fftSize);
  var imag = new Float32Array(fftSize);

  for (var frame = 0; frame < numFrames; frame++) {
    var offset = frame * hopSize;

    // Apply window and prepare FFT input
    for (var i = 0; i < fftSize; i++) {
      real[i] = (offset + i < data.length) ? data[offset + i] * hannWindow[i] : 0;
      imag[i] = 0;
    }

    // Bit-reversal permutation
    for (var i = 1, j = 0; i < fftSize; i++) {
      var bit = fftSize >> 1;
      while (j & bit) { j ^= bit; bit >>= 1; }
      j ^= bit;
      if (i < j) {
        var tmp = real[i]; real[i] = real[j]; real[j] = tmp;
        tmp = imag[i]; imag[i] = imag[j]; imag[j] = tmp;
      }
    }

    // FFT butterfly
    for (var len = 2; len <= fftSize; len <<= 1) {
      var ang = -2 * Math.PI / len;
      var wR = Math.cos(ang);
      var wI = Math.sin(ang);
      for (var i = 0; i < fftSize; i += len) {
        var curR = 1, curI = 0;
        for (var j = 0; j < len / 2; j++) {
          var uR = real[i + j];
          var uI = imag[i + j];
          var vR = real[i + j + len / 2] * curR - imag[i + j + len / 2] * curI;
          var vI = real[i + j + len / 2] * curI + imag[i + j + len / 2] * curR;
          real[i + j] = uR + vR;
          imag[i + j] = uI + vI;
          real[i + j + len / 2] = uR - vR;
          imag[i + j + len / 2] = uI - vI;
          var newCurR = curR * wR - curI * wI;
          curI = curR * wI + curI * wR;
          curR = newCurR;
        }
      }
    }

    // Store magnitudes (dB)
    var base = frame * halfFFT;
    for (var i = 0; i < halfFFT; i++) {
      var mag = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
      magnitudes[base + i] = mag > 0 ? 20 * Math.log10(mag / fftSize) : -120;
    }
  }

  // Render to pixel array
  var pixels = new Uint8ClampedArray(w * h * 4);

  for (var x = 0; x < w; x++) {
    var frame = Math.floor(x / w * numFrames);
    var base = frame * halfFFT;
    for (var y = 0; y < h; y++) {
      var bin = rowBins[y];
      var binLow = Math.floor(bin);
      var binHigh = Math.min(binLow + 1, halfFFT - 1);
      var frac = bin - binLow;
      var dbVal = magnitudes[base + binLow] * (1 - frac) + magnitudes[base + binHigh] * frac;

      // Map dB to color: -100dB = dark blue, -20dB = bright yellow
      var norm = Math.max(0, Math.min(1, (dbVal + 100) / 80));
      var idx = (y * w + x) * 4;
      // Dark blue -> cyan -> yellow -> white
      if (norm < 0.33) {
        var t = norm / 0.33;
        pixels[idx]     = Math.floor(10 * (1 - t) + 0 * t);   // R
        pixels[idx + 1] = Math.floor(10 * (1 - t) + 80 * t);  // G
        pixels[idx + 2] = Math.floor(60 * (1 - t) + 160 * t); // B
      } else if (norm < 0.66) {
        var t = (norm - 0.33) / 0.33;
        pixels[idx]     = Math.floor(0 + 220 * t);     // R
        pixels[idx + 1] = Math.floor(80 + 140 * t);    // G
        pixels[idx + 2] = Math.floor(160 * (1 - t));    // B
      } else {
        var t = (norm - 0.66) / 0.34;
        pixels[idx]     = Math.floor(220 + 35 * t);    // R
        pixels[idx + 1] = Math.floor(220 + 35 * t);    // G
        pixels[idx + 2] = Math.floor(0 + 180 * t);     // B
      }
      pixels[idx + 3] = 255;
    }
  }

  // Transfer the pixel buffer back (avoids copy)
  self.postMessage({ pixels: pixels, width: w, height: h }, [pixels.buffer]);
};
