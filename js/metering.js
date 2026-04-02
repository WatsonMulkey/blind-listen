// ─── Metering (ITU-R BS.1770-4 LUFS) ─────────────────────────
// PAID_GATE: LUFS metering (ungated for now — all users get this)

function getKWeightStage1(fs) {
  const db = 3.999843853973347;
  const f0 = 1681.974450955533;
  const Q  = 0.7071752369554196;
  const K  = Math.tan(Math.PI * f0 / fs);
  const Vh = Math.pow(10, db / 20);
  const Vb = Math.pow(Vh, 0.4996667741545416);
  const a0 = 1 + K / Q + K * K;
  return [
    [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0],
    [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0]
  ];
}

function getKWeightStage2(fs) {
  const f0 = 38.13547087602444;
  const Q  = 0.5003270373238773;
  const K  = Math.tan(Math.PI * f0 / fs);
  const a0 = 1 + K / Q + K * K;
  return [
    [1 / a0, -2 / a0, 1 / a0],
    [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0]
  ];
}

async function computeLUFS(buffer) {
  const sr = buffer.sampleRate;
  const len = buffer.length;
  const ch = buffer.numberOfChannels;

  const offline = new OfflineAudioContext(ch, len, sr);
  const [fb1, fa1] = getKWeightStage1(sr);
  const [fb2, fa2] = getKWeightStage2(sr);
  const stage1 = offline.createIIRFilter(fb1, fa1);
  const stage2 = offline.createIIRFilter(fb2, fa2);
  const src = offline.createBufferSource();
  src.buffer = buffer;
  src.connect(stage1);
  stage1.connect(stage2);
  stage2.connect(offline.destination);
  src.start(0);
  const filtered = await offline.startRendering();

  // Gated loudness (BS.1770-4)
  const blockSize = Math.round(0.4 * sr);
  const stepSize = Math.round(0.1 * sr);
  const channelData = [];
  for (let c = 0; c < ch; c++) channelData.push(filtered.getChannelData(c));

  const blockLoudness = [];
  for (let start = 0; start + blockSize <= len; start += stepSize) {
    let sumMS = 0;
    for (let c = 0; c < ch; c++) {
      let s = 0;
      const d = channelData[c];
      for (let i = start; i < start + blockSize; i++) s += d[i] * d[i];
      sumMS += s / blockSize;
    }
    if (sumMS > 0) blockLoudness.push(-0.691 + 10 * Math.log10(sumMS));
  }

  if (blockLoudness.length === 0) return -Infinity;

  // Absolute gate: -70 LUFS
  const absGated = blockLoudness.filter(l => l > -70);
  if (absGated.length === 0) return -Infinity;

  // Relative gate: mean - 10 dB
  const absGatedPower = absGated.reduce((s, l) => s + Math.pow(10, (l + 0.691) / 10), 0) / absGated.length;
  const relThreshold = -0.691 + 10 * Math.log10(absGatedPower) - 10;
  const relGated = blockLoudness.filter(l => l > relThreshold);
  if (relGated.length === 0) return -Infinity;

  const finalPower = relGated.reduce((s, l) => s + Math.pow(10, (l + 0.691) / 10), 0) / relGated.length;
  return -0.691 + 10 * Math.log10(finalPower);
}

function computePeakDBFS(buffer) {
  let maxAbs = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      const a = Math.abs(data[i]);
      if (a > maxAbs) maxAbs = a;
    }
  }
  return maxAbs > 0 ? 20 * Math.log10(maxAbs) : -Infinity;
}

function computeRMSdB(buffer) {
  let totalSq = 0;
  let totalSamples = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) totalSq += data[i] * data[i];
    totalSamples += data.length;
  }
  const rms = Math.sqrt(totalSq / totalSamples);
  return rms > 0 ? 20 * Math.log10(rms) : -Infinity;
}

async function computeAllMetering() {
  mixLUFS = new Array(buffers.length).fill(null);
  mixPeak = new Array(buffers.length).fill(null);
  mixRMS = new Array(buffers.length).fill(null);
  mixGainOffsets = new Array(buffers.length).fill(1.0);

  const promises = buffers.map(async (buf, i) => {
    if (!buf) return;
    mixPeak[i] = computePeakDBFS(buf);
    mixRMS[i] = computeRMSdB(buf);
    mixLUFS[i] = await computeLUFS(buf);
  });
  await Promise.all(promises);

  // Compute level match gain offsets
  const validLUFS = mixLUFS.filter(l => l !== null && isFinite(l));
  if (validLUFS.length >= 2) {
    const targetLUFS = validLUFS.reduce((a, b) => a + b, 0) / validLUFS.length;
    for (let i = 0; i < buffers.length; i++) {
      if (mixLUFS[i] !== null && isFinite(mixLUFS[i])) {
        const gainDB = Math.max(-12, Math.min(12, targetLUFS - mixLUFS[i]));
        mixGainOffsets[i] = Math.pow(10, gainDB / 20);
      }
    }
  }
}

function renderMixStats() {
  mixStatsRow.innerHTML = '';
  for (let i = 0; i < shuffleMap.length; i++) {
    const fileIdx = shuffleMap[i];
    const div = document.createElement('div');
    div.className = 'mix-stat';
    const lufs = mixLUFS[fileIdx];
    const peak = mixPeak[fileIdx];
    const lufsStr = (lufs !== null && isFinite(lufs)) ? lufs.toFixed(1) : '--';
    const peakStr = (peak !== null && isFinite(peak)) ? peak.toFixed(1) : '--';
    div.innerHTML =
      `<div class="mix-stat-label">${LABELS[i]}</div>` +
      `<div class="mix-stat-values"><span>${lufsStr} LUFS</span><span>${peakStr} dBFS</span></div>`;
    mixStatsRow.appendChild(div);
  }
}

function toggleLevelMatch() {
  levelMatchEnabled = !levelMatchEnabled;
  levelMatchBtn.classList.toggle('active', levelMatchEnabled);
  levelMatchBtn.setAttribute('aria-pressed', String(levelMatchEnabled));
  levelMatchBadge.classList.toggle('visible', levelMatchEnabled);

  if (activeIndex >= 0) {
    const fileIdx = shuffleMap[activeIndex];
    if (levelMatchEnabled && mixGainOffsets[fileIdx] !== undefined) {
      levelMatchGain.gain.setValueAtTime(mixGainOffsets[fileIdx], audioCtx.currentTime);
    } else {
      levelMatchGain.gain.setValueAtTime(1.0, audioCtx.currentTime);
    }
  }
}

levelMatchBtn.addEventListener('click', toggleLevelMatch);
