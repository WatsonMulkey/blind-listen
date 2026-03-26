// ─── State ────────────────────────────────────────────────────
const LABELS = ['X', 'Y', 'Z', 'W', 'V'];
let files = [];
let buffers = [];
let fileStates = [];
let shuffleMap = [];
let audioCtx = null;
let sourceNode = null;
let gainNode = null;
let activeIndex = -1;
let isPlaying = false;
let startedAt = 0;
let pausedAt = 0;
let duration = 0;
let revealed = false;
let animFrame = null;

// Metering state
let mixLUFS = [];
let mixPeak = [];
let mixRMS = [];
let levelMatchEnabled = false;
let levelMatchGain = null;
let mixGainOffsets = [];

// Lock-in reshuffle state
// PAID_GATE: lock-in reshuffle (ungated for now — all users get this)
let lockedBtnIndex = -1;     // which button index the user locked
let lockedFileIndex = -1;    // which file index was behind that button
let firstPickFileIndex = -1; // file index from first round (before reshuffle)

// Reference track state
let refFile = null;
let refBuffer = null;
let refGainNode = null;
let refSourceNode = null;
let refActive = false;

// Spectrogram state
let spectrogramMode = false; // false = waveform, true = spectrogram
let spectrogramCache = new Map(); // bufferIndex → ImageData

// Phase 1B state
let loopEnabled = false;
let loopStart = 0;
let loopEnd = 0;
let waveformVisible = true;
let sessionSeconds = 600;
let timerInterval = null;
let timerStarted = false;

// ─── DOM refs ─────────────────────────────────────────────────
const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');
const fileListEl = document.getElementById('fileList');
const fileSummary = document.getElementById('fileSummary');
const player = document.getElementById('player');
const mixButtons = document.getElementById('mixButtons');
const playBtn = document.getElementById('playBtn');
const seekBar = document.getElementById('seekBar');
const volumeBar = document.getElementById('volumeBar');
const noteRows = document.getElementById('noteRows');
const revealBtn = document.getElementById('revealBtn');
const reshuffleBtn = document.getElementById('reshuffleBtn');

const mixStatsRow = document.getElementById('mixStatsRow');
const levelMatchBtn = document.getElementById('levelMatchBtn');
const levelMatchBadge = document.getElementById('levelMatchBadge');

const timeElapsed = document.getElementById('timeElapsed');
const timeDuration = document.getElementById('timeDuration');
const waveformToggle = document.getElementById('waveformToggle');
const waveformContainer = document.getElementById('waveformContainer');
const waveformCanvas = document.getElementById('waveformCanvas');
const waveformPlayhead = document.getElementById('waveformPlayhead');
const loopToggle = document.getElementById('loopToggle');
const loopBody = document.getElementById('loopBody');
const loopStartInput = document.getElementById('loopStartInput');
const loopEndInput = document.getElementById('loopEndInput');
const rerollBtn = document.getElementById('rerollBtn');
const loopHint = document.getElementById('loopHint');
const loopRegion = document.getElementById('loopRegion');
const loopStartMarker = document.getElementById('loopStartMarker');
const loopEndMarker = document.getElementById('loopEndMarker');
const seekLoopRegion = document.getElementById('seekLoopRegion');
const loopControls = document.getElementById('loopControls');
const timerValue = document.getElementById('timerValue');
const timerBadge = document.getElementById('timerBadge');
const mainH1 = document.querySelector('body > h1');
const mainSubtitle = document.querySelector('body > .subtitle');
const durationWarning = document.getElementById('durationWarning');
const durationDismiss = document.getElementById('durationDismiss');
const consistencyResult = document.getElementById('consistencyResult');
const spectrogramToggle = document.getElementById('spectrogramToggle');
const spectrogramCanvas = document.getElementById('spectrogramCanvas');
const waveformLabel = document.getElementById('waveformLabel');
const exportActions = document.getElementById('exportActions');
const exportCopyBtn = document.getElementById('exportCopyBtn');
const exportTxtBtn = document.getElementById('exportTxtBtn');
const exportPdfBtn = document.getElementById('exportPdfBtn');

// Disable transport controls on load
playBtn.disabled = true;
seekBar.disabled = true;
volumeBar.disabled = true;

// ─── Utility ──────────────────────────────────────────────────

function fmt(s) {
  if (s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  const whole = Math.floor(sec);
  const frac = sec - whole;
  if (frac >= 0.05) {
    return `${m}:${whole.toString().padStart(2, '0')}.${Math.floor(frac * 10)}`;
  }
  return `${m}:${whole.toString().padStart(2, '0')}`;
}

function parseTime(str) {
  const parts = str.trim().split(':');
  if (parts.length === 2) {
    const mins = parseInt(parts[0], 10) || 0;
    const secs = parseFloat(parts[1]) || 0;
    return mins * 60 + secs;
  }
  return parseFloat(str) || 0;
}

function fmtSize(bytes) {
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ─── File list rendering ──────────────────────────────────────

function renderFileList() {
  fileListEl.innerHTML = '';
  for (const fs of fileStates) {
    const li = document.createElement('li');
    let iconHTML = '', statusClass = '', statusText = '', itemClass = 'file-item';
    switch (fs.status) {
      case 'pending':
        iconHTML = '<span style="color:var(--text-muted)">\u00b7</span>';
        statusClass = 'decoding'; statusText = 'Pending'; break;
      case 'decoding':
        iconHTML = '<span class="spinner"></span>';
        statusClass = 'decoding'; statusText = 'Decoding\u2026'; break;
      case 'ready':
        iconHTML = '<span style="color:var(--success)">\u2713</span>';
        statusClass = 'ready'; statusText = 'Ready'; itemClass += ' success'; break;
      case 'error':
        iconHTML = '<span style="color:var(--error)">\u2717</span>';
        statusClass = 'error-msg'; statusText = fs.error || 'Error'; itemClass += ' error'; break;
    }
    const idx = fileStates.indexOf(fs);
    li.className = itemClass;
    li.innerHTML =
      `<span class="file-status-icon" aria-hidden="true">${iconHTML}</span>` +
      `<span class="file-name">Track ${idx + 1}</span>` +
      `<span class="file-size">${fmtSize(fs.size)}</span>` +
      `<span class="file-status-text ${statusClass}" title="${statusText}">${statusText}</span>`;

    if (fs.status === 'error' || fs.status === 'ready') {
      const removeBtn = document.createElement('button');
      removeBtn.className = 'file-remove-btn';
      removeBtn.innerHTML = '&times;';
      removeBtn.setAttribute('aria-label', `Remove Track ${idx + 1}`);
      removeBtn.addEventListener('click', () => removeFile(idx));
      li.appendChild(removeBtn);
    }

    fileListEl.appendChild(li);
  }

  const readyCount = fileStates.filter(f => f.status === 'ready').length;
  const total = fileStates.length;
  const allDone = fileStates.every(f => f.status === 'ready' || f.status === 'error');

  if (total === 0) {
    fileSummary.textContent = '';
    fileSummary.classList.remove('all-ready');
  } else if (!allDone) {
    fileSummary.textContent = `Decoding ${readyCount} of ${total} files\u2026`;
    fileSummary.classList.remove('all-ready');
  } else if (readyCount >= 2) {
    fileSummary.textContent = `All ${readyCount} files ready \u2014 pick a mix to start`;
    fileSummary.classList.add('all-ready');
  } else if (readyCount === 1) {
    fileSummary.textContent = `${readyCount} file ready \u2014 add at least 1 more`;
    fileSummary.classList.remove('all-ready');
  } else {
    fileSummary.textContent = 'No files could be decoded';
    fileSummary.classList.remove('all-ready');
  }
}

function updateTransportState() {
  const readyCount = fileStates.filter(f => f.status === 'ready').length;
  const enable = readyCount >= 2;
  playBtn.disabled = !enable;
  seekBar.disabled = !enable;
  volumeBar.disabled = !enable;
}

function removeFile(idx) {
  if (isPlaying) pause();
  files.splice(idx, 1);
  buffers.splice(idx, 1);
  fileStates.splice(idx, 1);
  renderFileList();
  updateTransportState();
}

// ─── Upload handling ──────────────────────────────────────────

uploadZone.addEventListener('click', (e) => {
  if (e.target === fileInput) return;
  fileInput.click();
});
fileInput.addEventListener('change', e => {
  handleFiles(e.target.files);
  fileInput.value = '';
});
fileInput.addEventListener('click', e => e.stopPropagation());

uploadZone.addEventListener('dragover', e => {
  e.preventDefault();
  uploadZone.classList.add('dragover');
});
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('dragover');
  handleFiles(e.dataTransfer.files);
});

async function handleFiles(fileList) {
  const newAudio = [...fileList].filter(f => f.type.startsWith('audio/') || /\.(wav|mp3|flac|aiff|ogg|m4a|aac|wma)$/i.test(f.name));

  if (newAudio.length === 0) {
    fileSummary.textContent = 'No audio files detected';
    fileSummary.classList.remove('all-ready');
    return;
  }

  const totalAfter = files.length + newAudio.length;
  if (totalAfter > 5) {
    fileSummary.textContent = `Too many files (${totalAfter}) \u2014 max 5`;
    fileSummary.classList.remove('all-ready');
    return;
  }

  const startIdx = files.length;
  for (const f of newAudio) {
    files.push(f);
    buffers.push(null);
    fileStates.push({ name: f.name, size: f.size, status: 'pending', error: null });
  }
  renderFileList();

  if (!audioCtx) {
    audioCtx = new AudioContext();
    levelMatchGain = audioCtx.createGain();
    levelMatchGain.gain.value = 1.0;
    gainNode = audioCtx.createGain();
    gainNode.gain.value = volumeBar.value / 100;
    levelMatchGain.connect(gainNode);
    gainNode.connect(audioCtx.destination);
  }

  for (let i = startIdx; i < files.length; i++) {
    fileStates[i].status = 'decoding';
    renderFileList();
    try {
      const arr = await files[i].arrayBuffer();
      const decoded = await audioCtx.decodeAudioData(arr);
      buffers[i] = decoded;
      fileStates[i].status = 'ready';
    } catch (err) {
      fileStates[i].status = 'error';
      fileStates[i].error = err.message || 'Decode failed';
    }
    renderFileList();
    updateTransportState();
  }

  // Check duration mismatch among decoded buffers
  const decodedDurations = buffers.filter(b => b !== null).map(b => b.duration);
  if (decodedDurations.length >= 2 && !sessionStorage.getItem('durationWarningDismissed')) {
    const minDur = Math.min(...decodedDurations);
    const maxDur = Math.max(...decodedDurations);
    if (maxDur / minDur > 1.10) {
      durationWarning.style.display = 'flex';
    } else {
      durationWarning.style.display = 'none';
    }
  }

  const readyCount = fileStates.filter(f => f.status === 'ready').length;
  if (readyCount >= 2) {
    duration = Math.max(...buffers.filter(b => b !== null).map(b => b.duration));
    computeAllMetering().then(() => renderMixStats());
    shuffle();
    buildUI();
    mainH1.style.display = 'none';
    mainSubtitle.style.display = 'none';
    uploadZone.style.display = 'none';
    fileListEl.style.display = 'none';
    fileSummary.style.display = 'none';
    durationWarning.style.display = 'none';
    player.classList.add('active');
    if (waveformVisible && shuffleMap.length > 0) {
      const fileIdx = shuffleMap[0];
      if (buffers[fileIdx]) drawWaveform(buffers[fileIdx]);
    }
    startSessionTimer();
  }
}

function shuffle() {
  stop();
  revealed = false;
  const readyIndices = fileStates
    .map((fs, i) => fs.status === 'ready' ? i : -1)
    .filter(i => i >= 0);
  shuffleMap = [...readyIndices];
  for (let i = shuffleMap.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffleMap[i], shuffleMap[j]] = [shuffleMap[j], shuffleMap[i]];
  }
}
