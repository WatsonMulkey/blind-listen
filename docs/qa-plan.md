# Blind Listen — QA Test Plan

**Version**: 1.0
**Date**: 2026-03-26
**Scope**: blind-listen/index.html + js/ modules
**Stack**: Vanilla JS, Web Audio API, Canvas, jsPDF CDN
**Test environment**: Browser-only (no build step, no server)
**Companion file**: `test-runner.html` (automated unit tests)

---

## 1. Testing Strategy Overview

Blind Listen is a pure client-side app. There is no network layer, no database, and no build pipeline to test. The risk surface concentrates in three areas:

1. **Audio engine correctness** — Sync, seek, loop boundaries, and gain routing must be exact. A 50ms seek error is perceptible; a 3dB gain error invalidates a level-match session.
2. **LUFS metering math** — The ITU-R BS.1770-4 implementation is custom JS. A bug here silently produces wrong results that users will trust.
3. **State machine integrity** — The shuffle/reveal/reshuffle cycle and lock-in feature have branching state that can leave the app in an inconsistent condition if transitions are missed.

### Test layers

| Layer | Method | Coverage |
|---|---|---|
| Pure functions (fmt, parseTime, fmtSize) | `test-runner.html` unit tests | Automated |
| LUFS/RMS/Peak math | `test-runner.html` unit tests with synthetic signals | Automated |
| FFT / spectrogram | `test-runner.html` unit tests | Automated |
| Shuffle/lock state machine | `test-runner.html` unit tests | Automated |
| Transport / audio engine | Manual test checklist | Manual |
| File upload flows | Manual test checklist | Manual |
| UI/UX + keyboard shortcuts | Manual test checklist | Manual |
| Browser compatibility | Manual test checklist | Manual |
| Accessibility | Manual test checklist | Manual |
| Performance | Manual observation with DevTools | Manual |

---

## 2. Priority Definitions

| Priority | Meaning |
|---|---|
| P0 | App-breaking. Blocks core use case. Must fix before any release. |
| P1 | Serious functional defect. User can partially work around but outcome is wrong. |
| P2 | Degraded experience. User can complete their task but something is noticeably broken. |
| P3 | Polish, edge case, or cosmetic. Low user impact. |

---

## 3. Functional Testing — User Flows

### 3.1 File Upload

**Test ID**: FU-001
**Description**: Click on upload zone opens native file picker
**Steps**:
1. Open `index.html` in browser
2. Click anywhere on the upload zone
**Expected**: Native OS file dialog opens
**Priority**: P0

---

**Test ID**: FU-002
**Description**: Upload zone click does not conflict with hidden file input
**Steps**:
1. Click upload zone
2. Dismiss dialog without selecting files
3. Click upload zone again
**Expected**: Dialog opens again with no errors. This is the regression test for the original click-handler conflict bug where `fileInput.value = ''` after each change prevents the same file being reloaded, but also ensures click events do not double-fire.
**Priority**: P0

---

**Test ID**: FU-003
**Description**: Drag-and-drop two valid audio files
**Steps**:
1. Open `index.html`
2. Drag two WAV files onto the upload zone
3. Release (drop)
**Expected**: Both files appear in the file list with spinner, then "Ready" status. File summary reads "All 2 files ready — pick a mix to start." Player section becomes visible.
**Priority**: P0

---

**Test ID**: FU-004
**Description**: Drag-and-drop shows visual feedback (dragover state)
**Steps**:
1. Drag an audio file over the upload zone but do not drop
**Expected**: Upload zone border turns accent color (`--accent`), background lightens. Releasing outside the zone removes this state.
**Priority**: P2

---

**Test ID**: FU-005
**Description**: Drop a non-audio file (e.g. `.txt`, `.jpg`)
**Steps**:
1. Drag a `.txt` file onto the upload zone and drop
**Expected**: `fileSummary` reads "No audio files detected." No crash. Upload zone remains visible.
**Priority**: P1

---

**Test ID**: FU-006
**Description**: Upload exactly 1 audio file
**Steps**:
1. Upload one WAV file
**Expected**: File shows "Ready." Summary reads "1 file ready — add at least 1 more." Player does NOT appear. Transport controls remain disabled.
**Priority**: P0

---

**Test ID**: FU-007
**Description**: Upload exactly 2 audio files (minimum valid set)
**Steps**:
1. Upload two audio files
**Expected**: Both decode, player appears with buttons X and Y. Mix stats row shows two stat columns.
**Priority**: P0

---

**Test ID**: FU-008
**Description**: Upload exactly 5 audio files (maximum valid set)
**Steps**:
1. Upload five audio files simultaneously
**Expected**: All decode, player shows five buttons (X, Y, Z, W, V). Five note inputs. Five stat columns.
**Priority**: P0

---

**Test ID**: FU-009
**Description**: Attempt to upload 6 files
**Steps**:
1. Upload 5 files
2. Attempt to add 1 more (total = 6)
**Expected**: Summary reads "Too many files (6) — max 5." No new file is added. Existing 5 remain intact.
**Priority**: P0

---

**Test ID**: FU-010
**Description**: Upload file with special characters in name (e.g. `mix (final) — v2 [copy].wav`)
**Steps**:
1. Upload a file whose name contains parentheses, dashes, brackets, Unicode
**Expected**: File decodes normally. Name is truncated with ellipsis in file list. On reveal, button label shows the name without extension. No JS error in console.
**Priority**: P1

---

**Test ID**: FU-011
**Description**: Upload a corrupt or empty (0-byte) file
**Steps**:
1. Create a 0-byte file and name it `empty.wav`
2. Upload it
**Expected**: File item shows error state (red border, X icon). Status text shows decode error message. App does not crash. Other files in the list are unaffected.
**Priority**: P1

---

**Test ID**: FU-012
**Description**: Remove a file from the list
**Steps**:
1. Upload 3 files
2. Click the × button on the second file
**Expected**: File is removed from list. Remaining 2 files are renumbered. If playing, playback stops.
**Priority**: P1

---

**Test ID**: FU-013
**Description**: Duration mismatch warning appears when files differ by >10%
**Steps**:
1. Upload one 3-minute track and one 30-second track
**Expected**: Yellow warning banner appears: "These files differ in length by more than 10%."
**Priority**: P1

---

**Test ID**: FU-014
**Description**: Duration mismatch warning dismissed and suppressed
**Steps**:
1. Upload mismatched files
2. Click × on the duration warning
**Expected**: Warning disappears. `sessionStorage.durationWarningDismissed` is set. Reloading the same session does not re-show warning.
**Priority**: P2

---

**Test ID**: FU-015
**Description**: Upload a very large file (500MB+)
**Steps**:
1. Upload a 500MB WAV file
**Expected**: Spinner shows during decode (which may take 10-30 seconds). UI remains responsive (not frozen). After decode, "Ready" status appears. Note any tab memory pressure in DevTools.
**Priority**: P1
**Notes**: This is a performance and memory test as much as a functional test.

---

**Test ID**: FU-016
**Description**: Files with different sample rates (44.1kHz vs 48kHz vs 96kHz)
**Steps**:
1. Upload one 44100 Hz WAV and one 48000 Hz WAV
**Expected**: Both decode. LUFS values are computed separately (each uses its own `sampleRate` from `buffer.sampleRate`). Playback proceeds normally. No artifacts from sample-rate mismatch (Web Audio API handles resampling internally).
**Priority**: P1

---

**Test ID**: FU-017
**Description**: Upload mono file alongside stereo file
**Steps**:
1. Upload one mono WAV and one stereo WAV
**Expected**: Both decode. Waveform draws correctly for each (channel 0 is always used for display). LUFS computation uses `buffer.numberOfChannels` correctly. No crash.
**Priority**: P1

---

### 3.2 Mix Switching

**Test ID**: MS-001
**Description**: Click a mix button while stopped
**Steps**:
1. Upload 2 files, wait for ready state
2. Click button X
**Expected**: X button gets active state (accent border, glow). waveform redraws. Playback does not start.
**Priority**: P0

---

**Test ID**: MS-002
**Description**: Click a mix button while playing
**Steps**:
1. Start playback on X
2. Click button Y while playing
**Expected**: Playback switches instantly to Y at the same position. Seek bar continues without hiccup. No audio gap longer than ~100ms.
**Priority**: P0

---

**Test ID**: MS-003
**Description**: Switching mixes after reveal does nothing
**Steps**:
1. Click Reveal
2. Click mix buttons X and Y
**Expected**: `switchTo()` returns immediately because `revealed === true`. Buttons do not change active state.
**Priority**: P1

---

**Test ID**: MS-004
**Description**: Seek position clamped when switching to shorter track
**Steps**:
1. Upload a 5-minute and a 1-minute track
2. Seek to 4:00 on the longer track
3. Switch to the shorter track
**Expected**: Playback starts at the shorter track's duration (1:00) rather than crashing or seeking past end.
**Priority**: P1

---

### 3.3 Play / Pause / Stop / Seek

**Test ID**: PP-001
**Description**: Play button starts playback from beginning
**Steps**:
1. Upload 2 files, click X
2. Click Play button
**Expected**: Play button icon changes to pause (‖). Seek bar advances. Time elapsed increments.
**Priority**: P0

---

**Test ID**: PP-002
**Description**: Space key toggles play/pause
**Steps**:
1. After files are ready, press Space
**Expected**: Playback starts. Press Space again — playback pauses at current position. Press Space again — resumes from same position.
**Priority**: P0

---

**Test ID**: PP-003
**Description**: Playback auto-stops at end of file
**Steps**:
1. Seek to near the end (e.g. 0:02 before end)
2. Play and wait
**Expected**: Playback stops. Play button returns to play icon. `pausedAt` resets to 0. `isPlaying` is false.
**Priority**: P0

---

**Test ID**: PP-004
**Description**: Seek bar drag while playing
**Steps**:
1. Play a file
2. Drag seek bar to 50%
**Expected**: Playback jumps to 50% of duration. Audio resumes immediately from new position.
**Priority**: P0

---

**Test ID**: PP-005
**Description**: Space key has no effect when focus is on a text input
**Steps**:
1. Click into a note input field
2. Press Space
**Expected**: A space character is typed into the input. Playback does NOT toggle.
**Priority**: P1

---

**Test ID**: PP-006
**Description**: Seek bar shows correct visual fill percentage
**Steps**:
1. Play a file, watch seek bar at 25%, 50%, 75%
**Expected**: The CSS gradient fill matches the thumb position. `linear-gradient` percentages in the style attribute match `(currentTime / duration) * 100`.
**Priority**: P2

---

**Test ID**: PP-007
**Description**: Click-to-seek on waveform while stopped
**Steps**:
1. Click at 50% of waveform width while stopped
**Expected**: Playhead moves to 50%. Time elapsed updates. `pausedAt` is set to `0.5 * duration`. Playback does not start.
**Priority**: P1

---

**Test ID**: PP-008
**Description**: Click-to-seek on waveform while playing
**Steps**:
1. Start playback
2. Click at 75% of waveform width
**Expected**: Playback restarts at 75% of duration. Continuous playback (no stop/resume gap perceived as pause).
**Priority**: P1

---

**Test ID**: PP-009
**Description**: Volume bar adjusts output gain
**Steps**:
1. Play audio
2. Drag volume to 0
3. Drag volume to 100
**Expected**: Audio is silent at 0. Audio is at full gain at 100. `gainNode.gain.value` equals `volumeBar.value / 100`.
**Priority**: P1

---

### 3.4 Loop Controls

**Test ID**: LC-001
**Description**: Enable loop via button
**Steps**:
1. Upload 2 files and play
2. Click "Enable — L" button
**Expected**: Loop body expands. Start/end inputs appear. Loop region highlighted on waveform and seek bar. Default loop set to 0–30s (or full track if shorter).
**Priority**: P0

---

**Test ID**: LC-002
**Description**: Enable loop via L key
**Steps**:
1. Press L key
**Expected**: Same as LC-001.
**Priority**: P0

---

**Test ID**: LC-003
**Description**: Loop repeats correctly at loop end boundary
**Steps**:
1. Enable loop with start=0:05, end=0:10
2. Play and wait for first loop
**Expected**: Playback jumps from 0:10 back to 0:05 seamlessly. This repeats indefinitely.
**Priority**: P0

---

**Test ID**: LC-004
**Description**: Loop minimum 5 seconds enforced
**Steps**:
1. Enable loop
2. Set start to 0:00 and end to 0:03
**Expected**: End snaps to 0:05 (start + 5). User cannot create a loop shorter than 5 seconds.
**Priority**: P1

---

**Test ID**: LC-005
**Description**: Re-roll button randomizes loop region
**Steps**:
1. Enable loop
2. Note current start/end
3. Click "Re-roll" button three times
**Expected**: Each click produces different start/end values. All values are within [0, duration]. Loop is at least 5 seconds.
**Priority**: P1

---

**Test ID**: LC-006
**Description**: Drag loop start marker on waveform
**Steps**:
1. Enable loop
2. Click and drag the green start marker
**Expected**: Loop start updates in real-time. Input field updates. Loop region on waveform updates. Minimum 5s gap maintained.
**Priority**: P1

---

**Test ID**: LC-007
**Description**: Loop persists across mix switches
**Steps**:
1. Enable loop on mix X with region 0:10–0:20
2. Switch to mix Y
**Expected**: Loop stays active. Same region applied to Y. If Y is shorter, loop end is clamped to Y's duration.
**Priority**: P1

---

**Test ID**: LC-008
**Description**: Loop region updates on waveform when loopEnd is past end of shorter track
**Steps**:
1. Upload 3-minute and 1-minute tracks
2. Enable loop with end at 2:30
3. Switch to the 1-minute track
**Expected**: Loop end clamped to 1:00. Loop region displayed correctly within 1-minute track bounds.
**Priority**: P1

---

**Test ID**: LC-009
**Description**: Disabling loop restores normal playback
**Steps**:
1. Enable loop
2. Click loop toggle again to disable
**Expected**: Loop region disappears from waveform and seek bar. `sourceNode.loop` is false. Playback plays to end of track.
**Priority**: P1

---

**Test ID**: LC-010
**Description**: Re-roll on a very short track (under 10 seconds)
**Steps**:
1. Upload a 7-second audio file
2. Enable loop
3. Click Re-roll
**Expected**: Loop bounds stay within [0, 7s]. Minimum 5 seconds is respected. No negative or NaN values.
**Priority**: P2

---

### 3.5 Level Matching

**Test ID**: LM-001
**Description**: Level match button toggles gain compensation
**Steps**:
1. Upload two files with different loudness
2. Toggle Level Match ON
**Expected**: Button turns green (success style). "Matched" badge appears. Gain offsets applied to each mix. If one mix is 3dB louder, it is attenuated by 3dB relative to the average.
**Priority**: P0

---

**Test ID**: LM-002
**Description**: M key toggles level match
**Steps**:
1. Press M key
**Expected**: Level match toggles on/off same as button click.
**Priority**: P1

---

**Test ID**: LM-003
**Description**: Level match gain applied correctly at mix switch
**Steps**:
1. Enable level match
2. Switch between mixes X and Y while playing
**Expected**: `levelMatchGain.gain.value` is set to the correct `mixGainOffsets[fileIdx]` on each switch. Perceived volume stays constant.
**Priority**: P1

---

**Test ID**: LM-004
**Description**: Level match with only one valid LUFS value
**Steps**:
1. Upload a file with actual audio content and a silent (0dB RMS) file
**Expected**: `validLUFS.length < 2`, so no gain offsets are computed. Level match button still toggles but has no audible effect. No division-by-zero or NaN in `mixGainOffsets`.
**Priority**: P1

---

### 3.6 Spectrogram

**Test ID**: SP-001
**Description**: Spectrogram toggle shows spectrogram canvas
**Steps**:
1. Click "Spectrogram" button
**Expected**: `spectrogramCanvas` becomes visible. `waveformCanvas` is hidden. Label reads "Spectrogram". Button is active-styled.
**Priority**: P1

---

**Test ID**: SP-002
**Description**: Spectrogram cached on second view
**Steps**:
1. Toggle to spectrogram
2. Switch to another mix, then switch back
**Expected**: Second render is immediate (uses `spectrogramCache`). No recomputation (verify by timing or console log).
**Priority**: P2

---

**Test ID**: SP-003
**Description**: Spectrogram cache cleared on window resize
**Steps**:
1. Render spectrogram
2. Resize browser window
**Expected**: Cache is cleared (`spectrogramCache.size === 0`). Spectrogram recomputes at new canvas size.
**Priority**: P2

---

**Test ID**: SP-004
**Description**: Toggling spectrogram off restores waveform
**Steps**:
1. Enable spectrogram
2. Click Spectrogram button again
**Expected**: Waveform canvas visible, spectrogram canvas hidden. Label reverts to "Waveform".
**Priority**: P1

---

**Test ID**: SP-005
**Description**: Spectrogram with very short buffer (under 0.1s)
**Steps**:
1. Create an audio buffer shorter than `fftSize (2048) / sampleRate (44100) ≈ 46ms`
**Expected**: `numFrames <= 0` guard triggers, function returns without crash or blank canvas error.
**Priority**: P2

---

### 3.7 Lock-In and Reshuffle

**Test ID**: LR-001
**Description**: Lock a mix pick
**Steps**:
1. Upload 3 files
2. Click "Lock" under button Y
**Expected**: Y's lock button shows "Locked" state (amber border). All other locks remain unlocked.
**Priority**: P1

---

**Test ID**: LR-002
**Description**: Unlock a locked pick by clicking again
**Steps**:
1. Lock Y
2. Click Y's lock button again
**Expected**: Lock is removed. `lockedBtnIndex === -1`. Button reverts to "Lock" style.
**Priority**: P1

---

**Test ID**: LR-003
**Description**: Reshuffle while a pick is locked — consistency check fires
**Steps**:
1. Lock a pick (e.g. pick Y = mix A)
2. Click Reshuffle
3. Listen and pick what sounds like mix A (now under a different button label)
4. Click Reveal
**Expected**: Consistency result shows "Consistent" if the same file was picked, "Different" if not.
**Priority**: P0

---

**Test ID**: LR-004
**Description**: Reshuffle resets position and loop state
**Steps**:
1. Enable loop, seek to 1:30
2. Click Reshuffle
**Expected**: Position resets to 0. Loop is disabled. Loop region disappears. Active button is cleared.
**Priority**: P1

---

**Test ID**: LR-005
**Description**: Lock buttons are disabled after reveal
**Steps**:
1. Click Reveal
2. Try clicking lock buttons
**Expected**: All lock buttons have `disabled` attribute. No state change.
**Priority**: P1

---

### 3.8 Reference Track

**Test ID**: RT-001
**Description**: Add a reference track
**Steps**:
1. Click the REF button in the mix button row
2. Select an audio file
**Expected**: REF button updates to show filename (truncated). Button style changes to "loaded" state.
**Priority**: P1

---

**Test ID**: RT-002
**Description**: Switch to reference track plays ref audio
**Steps**:
1. Load a reference track
2. Click REF button (or press 0)
**Expected**: Reference audio plays. REF button gets active (amber) styling. Regular mix buttons are deactivated.
**Priority**: P1

---

**Test ID**: RT-003
**Description**: 0 key switches to reference track
**Steps**:
1. Load a reference track
2. Press 0 while on mix X
**Expected**: Switches to reference track. Same behavior as clicking REF button.
**Priority**: P1

---

**Test ID**: RT-004
**Description**: Switching from ref to mix preserves position
**Steps**:
1. Play ref track to 0:30
2. Click mix button X
**Expected**: Mix X starts at 0:30. `refActive` is set false. `deactivateRef()` is called.
**Priority**: P1

---

**Test ID**: RT-005
**Description**: Reshuffle deactivates reference track
**Steps**:
1. Switch to ref track
2. Click Reshuffle
**Expected**: `deactivateRef()` called. REF button loses active state. Active index is -1.
**Priority**: P1

---

### 3.9 Reveal and Consistency Check

**Test ID**: RV-001
**Description**: Reveal shows filenames on buttons
**Steps**:
1. Upload 2 files: `mix_a.wav` and `mix_b.wav`
2. Click Reveal
**Expected**: Button X shows "X\nmix_a" (or whichever file it was assigned). Extensions stripped. Buttons get `revealed` CSS class. Reveal button shows "Revealed!" and is disabled.
**Priority**: P0

---

**Test ID**: RV-002
**Description**: R key triggers reveal
**Steps**:
1. Press R key while unrevealed
**Expected**: Same as clicking Reveal button.
**Priority**: P1

---

**Test ID**: RV-003
**Description**: Export buttons appear after reveal
**Steps**:
1. Click Reveal
**Expected**: `#exportActions` div becomes visible with "Copy Text", "Download .txt", "Download PDF" buttons.
**Priority**: P1

---

**Test ID**: RV-004
**Description**: Consistency result shown only when lock was used
**Steps**: (A) No lock before reshuffle, then reveal. (B) Lock Y, reshuffle, pick again, reveal.
**Expected**: (A) No consistency result shown (`firstPickFileIndex === -1`). (B) Consistency result shown.
**Priority**: P1

---

### 3.10 Export

**Test ID**: EX-001
**Description**: Copy Text copies valid text to clipboard
**Steps**:
1. Upload 2 files, note filenames
2. Reveal
3. Click "Copy Text"
4. Paste into a text editor
**Expected**: Text contains date, mix assignments with LUFS/peak/RMS values, and "Generated by Blind Listen" footer. File names match uploaded files.
**Priority**: P1

---

**Test ID**: EX-002
**Description**: Download .txt creates correct file
**Steps**:
1. Reveal, click "Download .txt"
**Expected**: File named `blind-listen-results-YYYY-MM-DD.txt` downloads. Content identical to clipboard copy.
**Priority**: P1

---

**Test ID**: EX-003
**Description**: Download PDF creates readable file
**Steps**:
1. Reveal, click "Download PDF"
**Expected**: `blind-listen-results-YYYY-MM-DD.pdf` downloads. PDF opens with correct title, date, mix assignments, notes if any were entered.
**Priority**: P1

---

**Test ID**: EX-004
**Description**: Notes appear in export
**Steps**:
1. Type notes in two of the note inputs
2. Reveal, copy text
**Expected**: Notes section appears in export text. Each note is attributed to its label (X, Y, etc.).
**Priority**: P1

---

**Test ID**: EX-005
**Description**: Export when jsPDF is not loaded
**Steps**:
1. Open page in offline mode or block the CDN URL for jsPDF
2. Click "Download PDF"
**Expected**: `console.warn('jsPDF not loaded')` fires. No unhandled exception. User-visible behavior: nothing downloads (graceful degradation).
**Priority**: P2

---

**Test ID**: EX-006
**Description**: Export with very long filenames
**Steps**:
1. Upload file with 200-character name
2. Reveal, export PDF
**Expected**: PDF does not crash jsPDF. Long filename is either truncated or wrapped. No layout overflow.
**Priority**: P2

---

### 3.11 Keyboard Shortcuts

**Test ID**: KS-001
**Description**: Arrow keys switch between mixes
**Steps**:
1. Upload 3 files
2. Click X button
3. Press ArrowRight
**Expected**: Switches to Y. Press again → Z. Press again → wraps to X.
**Priority**: P0

---

**Test ID**: KS-002
**Description**: Number keys 1-5 switch mixes
**Steps**:
1. Upload 5 files
2. Press 3
**Expected**: Switches to Z (third mix). Press 5 → switches to V.
**Priority**: P1

---

**Test ID**: KS-003
**Description**: Number key out of range ignored
**Steps**:
1. Upload 2 files (only X and Y exist)
2. Press 5
**Expected**: Nothing happens. `readyCount < 5` guard prevents `switchTo(4)`.
**Priority**: P2

---

**Test ID**: KS-004
**Description**: Keyboard events suppressed in input fields
**Steps**:
1. Click a note input
2. Press Space, 1, 2, ArrowLeft, ArrowRight, L, R
**Expected**: All keys type into the input. None trigger transport or mix switch actions.
**Priority**: P1

---

### 3.12 Session Timer

**Test ID**: ST-001
**Description**: Timer starts when player becomes active
**Steps**:
1. Upload 2 files, wait for ready state
2. Observe timer immediately after player appears
**Expected**: Timer starts at 10:00 and counts down.
**Priority**: P1

---

**Test ID**: ST-002
**Description**: Timer turns warning color below 2 minutes
**Steps**:
1. Reduce `sessionSeconds` in DevTools console to 119
**Expected**: Timer shows amber/warning class. "Low" badge appears.
**Priority**: P2

---

**Test ID**: ST-003
**Description**: Timer turns critical color below 30 seconds
**Steps**:
1. Reduce `sessionSeconds` to 29
**Expected**: Timer shows red/critical class. Badge changes.
**Priority**: P2

---

**Test ID**: ST-004
**Description**: Playback pauses when timer reaches 0
**Steps**:
1. Set `sessionSeconds = 1` in console
2. Play audio
**Expected**: After ~1 second, playback pauses automatically. Timer shows "Ended" badge.
**Priority**: P1

---

---

## 4. Edge Cases

### 4.1 File Boundary Cases

| Test ID | Input | Expected | Priority |
|---|---|---|---|
| EC-001 | 0-byte file renamed `.wav` | Error status in file list, no crash | P1 |
| EC-002 | File with `.wav` extension containing MP3 data | Browser decodes or errors gracefully | P1 |
| EC-003 | Two identical files (same data) | Both decode as "Ready", LUFS values equal, 0dB gain offset each | P2 |
| EC-004 | File exactly at 5-second duration | Loop minimum (5s) enforced — loop spans full track | P2 |
| EC-005 | File at 96kHz sample rate | `getKWeightStage1(96000)` and `getKWeightStage2(96000)` compute valid IIR coefficients | P1 |
| EC-006 | File with Unicode filename (`Mixx — Ünterøhm.flac`) | Display and export work; no JSON/encoding errors | P1 |
| EC-007 | 5 files, all decode errors | Summary reads "No files could be decoded." Player does not appear. | P1 |
| EC-008 | Files with 0.0 peak (pure silence) | Peak = -Infinity, LUFS = -Infinity. Display shows "--". No NaN. | P1 |

### 4.2 Seek / Time Boundary Cases

| Test ID | Scenario | Expected | Priority |
|---|---|---|---|
| EC-010 | Seek to exactly 0 | `pausedAt = 0`, no underflow | P1 |
| EC-011 | Seek to exactly duration | Clamped to `buffer.duration`. Playback starts and ends immediately. | P1 |
| EC-012 | `fmt(0)` | Returns "0:00" (not "0:00.0") | P1 |
| EC-013 | `fmt(60)` | Returns "1:00" | P1 |
| EC-014 | `fmt(3599.9)` | Returns "59:59.9" | P1 |
| EC-015 | `parseTime("0:30")` | Returns 30 | P1 |
| EC-016 | `parseTime("1:30.5")` | Returns 90.5 | P1 |
| EC-017 | `parseTime("")` | Returns 0 (not NaN) | P1 |
| EC-018 | `parseTime("abc")` | Returns 0 (not NaN) | P1 |

### 4.3 Loop Boundary Cases

| Test ID | Scenario | Expected | Priority |
|---|---|---|---|
| EC-020 | Loop start set to > loop end | End snaps to start + 5 | P1 |
| EC-021 | Loop start typed as negative number | Clamped to 0 | P1 |
| EC-022 | Loop end typed past track duration | Clamped to `dur` | P1 |
| EC-023 | Reroll on 4-second track | Loop spans full 4 seconds, no crash from `maxLen < 5` | P2 |

### 4.4 State Machine Cases

| Test ID | Scenario | Expected | Priority |
|---|---|---|---|
| EC-030 | Reveal then press R again | `revealed = true`, `revealBtn.click()` has no effect | P1 |
| EC-031 | Lock, unlock, reveal | No consistency result shown (`firstPickFileIndex` cleared on unlock) — VERIFY behavior. Currently `firstPickFileIndex` is only set during reshuffle, not on lock. | P1 |
| EC-032 | Reshuffle without locking | `firstPickFileIndex` unchanged from -1, no consistency result | P1 |
| EC-033 | ArrowLeft when no active button (-1) | `(−1 − 1 + N) % N` = `N − 2`... check wrap logic. Should gracefully handle. | P1 |

---

## 5. Audio Engine Testing

### 5.1 Playback Sync

**Test ID**: AE-001
**Description**: Mix switch preserves playback position within ±50ms
**Method**: Manual with visual seek bar observation
**Steps**:
1. Play a file. At exactly 0:30 (by seek bar), switch to another mix.
**Expected**: New mix picks up at or very near 0:30. The delta is `audioCtx.currentTime - startedAt` computation — verify no discontinuity.
**Priority**: P0

---

**Test ID**: AE-002
**Description**: Stop then play resumes from correct position
**Method**: Manual
**Steps**:
1. Seek to 1:00. Press pause.
2. Verify `timeElapsed` shows 1:00.
3. Press play again.
**Expected**: Audio resumes from 1:00. `startedAt = audioCtx.currentTime - pausedAt`.
**Priority**: P0

---

**Test ID**: AE-003
**Description**: `getActiveDuration()` returns correct buffer's duration
**Method**: Console verification
**Steps**:
1. Upload a 3-minute and 1-minute track.
2. Switch to each, open console, call `getActiveDuration()`.
**Expected**: Returns 180 for 3-minute track, 60 for 1-minute track. Not the global `duration` variable.
**Priority**: P1

---

**Test ID**: AE-004
**Description**: `getCurrentTime()` loop modulo computed correctly
**Method**: Unit test (see test-runner.html, test AE-004)
**Expected**: When `raw = loopEnd + 5`, `loopLen = 10`, result = `loopStart + 5`.
**Priority**: P1

---

**Test ID**: AE-005
**Description**: AudioContext is not created before first user interaction
**Method**: DevTools console
**Steps**:
1. Open page with no interaction
2. Open DevTools → Application → check AudioContext state
**Expected**: No AudioContext created until first file is uploaded or played.
**Notes**: AudioContext is created in `handleFiles()` which requires file selection — that is a user interaction. Verify `audioCtx.resume()` is called on play if state is `suspended`.
**Priority**: P1

---

### 5.2 Gain Routing

**Test ID**: AE-010
**Description**: Gain routing chain: sourceNode → levelMatchGain → gainNode → destination
**Method**: DevTools console inspection
**Steps**:
1. Load files. Open console. Inspect `sourceNode`, `levelMatchGain`, `gainNode`.
**Expected**: `gainNode.numberOfOutputs > 0` (connected). `levelMatchGain.numberOfOutputs > 0`. No orphaned nodes.
**Priority**: P1

---

**Test ID**: AE-011
**Description**: Level match gain clamped to reasonable range
**Method**: Unit test (see test-runner.html, LM-UNIT-001)
**Expected**: `mixGainOffsets` values are never > 10.0 (20dB boost) or < 0.001. Files with extreme LUFS differences should either be clamped or excluded from gain normalization.
**Notes**: The current implementation has no explicit clamp. A -60 LUFS file paired with -6 LUFS would produce a 54dB boost (gainOffset ≈ 501). This is a P1 risk for ear damage.
**Priority**: P1

---

---

## 6. LUFS Metering Validation

### 6.1 Known-Reference Tests

The LUFS algorithm is ITU-R BS.1770-4 with K-weighting (pre-filter + high-pass) + gated loudness. Verification uses synthetic signals.

**Test ID**: MV-001
**Description**: 1kHz -23 dBFS sine wave ≈ -23 LUFS
**Method**: Automated (see test-runner.html)
**Expected**: Computed LUFS is within ±0.5 of -23.0
**Priority**: P0

---

**Test ID**: MV-002
**Description**: Full-scale sine wave (0 dBFS) gives expected LUFS
**Method**: Automated
**Expected**: LUFS near 0.0 ± 1.0 (exact value depends on K-weighting at 1kHz, which is near unity gain).
**Priority**: P1

---

**Test ID**: MV-003
**Description**: Pure silence returns -Infinity LUFS
**Method**: Automated
**Expected**: `computeLUFS(silentBuffer) === -Infinity`
**Priority**: P1

---

**Test ID**: MV-004
**Description**: Peak dBFS at full scale
**Method**: Automated
**Expected**: `computePeakDBFS(buffer) ≈ 0.0 dBFS` for a signal with maximum sample value 1.0
**Priority**: P1

---

**Test ID**: MV-005
**Description**: RMS dB for -3 dBFS sine wave
**Method**: Automated
**Expected**: RMS ≈ -3 dBFS ± 0.1
**Priority**: P1

---

**Test ID**: MV-006
**Description**: Absolute gate at -70 LUFS
**Method**: Automated with signal below -70 LUFS
**Expected**: All blocks below gate → returns -Infinity
**Priority**: P1

---

**Test ID**: MV-007
**Description**: Level match gain computation correctness
**Method**: Automated
**Given**: Two mixes, LUFS = [-23.0, -20.0]
**Expected**: Target = -21.5, gainOffset[0] = 10^((-21.5 - -23.0)/20) ≈ 1.334, gainOffset[1] = 10^((-21.5 - -20.0)/20) ≈ 0.750
**Priority**: P0

---

### 6.2 IIR Filter Coefficient Validation

**Test ID**: MV-010
**Description**: Stage 1 K-weighting coefficients at 44100 Hz match reference values
**Method**: Automated (see test-runner.html)
**Expected**: `getKWeightStage1(44100)` returns coefficients matching published BS.1770 reference implementation within floating-point precision.
**Priority**: P1

---

**Test ID**: MV-011
**Description**: Stage 2 K-weighting (high-pass) at 44100 Hz
**Method**: Automated
**Expected**: `getKWeightStage2(44100)` returns expected high-pass filter at 38.1 Hz.
**Priority**: P1

---

---

## 7. Browser Compatibility

Test matrix — open `index.html` and run the core user flow (upload 2 files, play, switch, loop, reveal).

| Browser | Version | Priority | Notes |
|---|---|---|---|
| Chrome | Latest stable | P0 | Primary target |
| Firefox | Latest stable | P0 | Web Audio API slightly different |
| Safari | Latest macOS | P0 | `AudioContext` still needs user gesture; `decodeAudioData` behavior varies |
| Edge | Latest stable | P1 | Chromium-based, generally matches Chrome |
| Chrome Android | Latest | P1 | Touch events for loop marker drag |
| Safari iOS | Latest | P1 | Web Audio strict user-gesture requirement |
| Firefox Android | Latest | P2 | Lower priority but supported |

### Per-browser checks

**Test ID**: BC-001
**Description**: Web Audio API available
**Expected**: No `window.AudioContext is not a constructor` errors in console.

**Test ID**: BC-002
**Description**: `OfflineAudioContext` available for LUFS computation
**Expected**: No error when `computeLUFS` runs.

**Test ID**: BC-003
**Description**: Canvas `getContext('2d')` works
**Expected**: Waveform and spectrogram render.

**Test ID**: BC-004
**Description**: `navigator.clipboard.writeText` available
**Expected**: "Copy Text" works. (Note: HTTPS or localhost required for Clipboard API in most browsers.)

**Test ID**: BC-005
**Description**: Loop marker touch drag on iOS
**Expected**: Touch events fire, `touchstart`/`touchmove`/`touchend` handlers work. Markers drag correctly.

**Test ID**: BC-006
**Description**: `prefers-reduced-motion` CSS respected
**Expected**: In a system with reduced motion enabled, spinner animation stops, transitions are near-instant.

---

## 8. Accessibility

**Test ID**: A11Y-001
**Description**: Upload zone keyboard accessible
**Steps**: Tab to upload zone, press Enter or Space.
**Expected**: File dialog opens. (`tabindex="0"`, `role="button"` set in HTML.)
**Priority**: P1

---

**Test ID**: A11Y-002
**Description**: Play button ARIA label updates
**Steps**: Play audio, then pause.
**Expected**: `aria-label` is "Pause" while playing, "Play" while paused.
**Priority**: P1

---

**Test ID**: A11Y-003
**Description**: Seek bar has ARIA value text
**Steps**: During playback, inspect `seekBar` in DevTools.
**Expected**: `aria-valuetext` is set to e.g. "0:30 of 3:45" by `tickSeek()`.
**Priority**: P1

---

**Test ID**: A11Y-004
**Description**: Mix buttons have `role="radio"` and `aria-pressed`
**Steps**: Inspect a mix button after switching.
**Expected**: Active button has `aria-pressed="true"`. Inactive buttons have `aria-pressed="false"`.
**Priority**: P1

---

**Test ID**: A11Y-005
**Description**: File list uses `aria-live="polite"` for decode updates
**Steps**: Use a screen reader and upload files.
**Expected**: Screen reader announces status changes as files decode.
**Priority**: P2

---

**Test ID**: A11Y-006
**Description**: Duration warning has `role="note"`
**Expected**: `durationWarning` element has `role="note"` (confirmed in HTML). Screen reader announces it.
**Priority**: P2

---

**Test ID**: A11Y-007
**Description**: Color contrast for primary text on background
**Expected**: `#f0f0f5` (--text-primary) on `#09090f` (--bg-base): contrast ratio ≈ 17:1. Passes WCAG AA (4.5:1) and AAA (7:1).
**Priority**: P2

---

**Test ID**: A11Y-008
**Description**: Color contrast for muted text
**Expected**: `#4a4a60` (--text-muted) on `#09090f`: contrast ratio ≈ 2.8:1. FAILS WCAG AA. These are decorative/supporting labels (keyboard hints, timer label). Acceptable risk but worth noting.
**Priority**: P3

---

**Test ID**: A11Y-009
**Description**: Note inputs have aria-label
**Expected**: Each note input has `aria-label="Notes for Mix X"` (confirmed in ui.js). Screen reader identifies each correctly.
**Priority**: P1

---

---

## 9. Performance

**Test ID**: PERF-001
**Description**: Five 500MB files — memory usage stays under 3GB
**Method**: DevTools Memory tab, observe heap size during decode
**Expected**: Each decoded buffer (Float32Array) for a 500MB WAV at 44.1kHz stereo ≈ 475MB RAM. Five files ≈ 2.4GB. Monitor for OOM crash. Tab should not crash in Chrome.
**Priority**: P1

---

**Test ID**: PERF-002
**Description**: Spectrogram computation time for 5-minute track
**Method**: `console.time('spectrogram')` before/after `drawSpectrogram()`
**Expected**: Under 5 seconds on a modern laptop. UI thread should not appear frozen (although this is synchronous computation on the main thread).
**Priority**: P1
**Notes**: A 5-minute track at 44.1kHz with fftSize=2048, hop=512 produces ~25,000 frames × 2048/2 = 25.6M magnitude values. This is a known performance risk. Future improvement: Web Worker.

---

**Test ID**: PERF-003
**Description**: `tickSeek` animation loop CPU usage
**Method**: DevTools Performance tab → record 10 seconds of playback
**Expected**: `requestAnimationFrame` callback completes in <1ms per frame. No layout thrash.
**Priority**: P2

---

**Test ID**: PERF-004
**Description**: File decode does not freeze UI
**Method**: Manual observation — try clicking buttons during decode
**Expected**: Buttons remain interactive. Spinners animate. Decode is async (`await audioCtx.decodeAudioData`), not blocking.
**Priority**: P1

---

**Test ID**: PERF-005
**Description**: Rapid mix switching (click 5 buttons fast)
**Method**: Manual — click X, Y, Z, W, V in rapid succession
**Expected**: Each switch calls `stop()` before `play()`. No multiple simultaneous `sourceNode` instances. No audio overlap or error.
**Priority**: P1

---

---

## 10. Regression Tests — Known Bug History

**Test ID**: REG-001
**Description**: File upload click handler double-fire (original bug)
**Context**: Original bug where clicking uploadZone fired the click handler AND bubbled to the fileInput, causing double dialog open.
**Steps**:
1. Click upload zone once
2. Observe: exactly one file dialog appears
**Expected**: One dialog. No double open. (Fixed by setting `fileInput.value = ''` after each change event.)
**Priority**: P0

---

**Test ID**: REG-002
**Description**: Spectrogram window variable shadowing bug
**Context**: A historical version had `const window = ...` inside `drawSpectrogram`, shadowing the global `window`. This caused `window.devicePixelRatio` to fail.
**Steps**:
1. Open `waveform.js`, search for any local variable named `window` inside `drawSpectrogram`.
**Expected**: No such variable. `window.devicePixelRatio` works correctly.
**Priority**: P1

---

**Test ID**: REG-003
**Description**: `duration = Math.max(...)` overwriting seek range (historical bug)
**Context**: Originally `duration` was set to the max of all buffers, making seek on a shorter track exceed its length.
**Steps**:
1. Upload 3-minute and 1-minute tracks
2. Switch to the 1-minute track
3. Check seek bar max range and `timeDuration`
**Expected**: `timeDuration` shows 1:00, not 3:00. `getActiveDuration()` is used for seek display, not the global `duration`.
**Priority**: P0

---

**Test ID**: REG-004
**Description**: AudioContext creation before user gesture
**Context**: Originally `audioCtx = new AudioContext()` was called at module load, triggering browser autoplay policy warnings.
**Steps**:
1. Open browser with strict autoplay policy (Firefox, Chrome)
2. Open page, observe console before any interaction
**Expected**: No "AudioContext was not allowed to start" warning. No AudioContext created until file upload.
**Priority**: P1

---

**Test ID**: REG-005
**Description**: Silent `try/catch` in stop() masked errors
**Context**: Original bug where `sourceNode.stop()` errors were silently swallowed.
**Steps**:
1. Call `stop()` when no source is playing (e.g. call twice rapidly)
**Expected**: `console.warn('Audio stop:', err.message)` fires instead of silent failure. No unhandled exception propagates.
**Priority**: P2

---

---

## 11. Coverage Summary

### What Is Tested

| Area | Coverage | Method |
|---|---|---|
| `fmt()` / `parseTime()` / `fmtSize()` | Comprehensive — all branches | Automated unit tests |
| LUFS math (computeLUFS) | Core algorithm + known references | Automated unit tests |
| Peak dBFS / RMS dB | Core algorithm | Automated unit tests |
| Level match gain computation | Formula + edge cases | Automated unit tests |
| FFT correctness | Known-frequency input validation | Automated unit tests |
| Shuffle algorithm distribution | Randomness check over N iterations | Automated unit tests |
| File upload happy path | 2 and 5 file scenarios | Manual |
| File upload rejection (0, 1, 6+ files) | All reject cases | Manual |
| Corrupt / empty file handling | Error state rendering | Manual |
| Transport (play/pause/stop/seek) | Core flows | Manual |
| Loop enable/disable/boundaries | Core flows + edge cases | Manual |
| Level match toggle | On/off behavior | Manual |
| Reveal / reshuffle state machine | Core flows | Manual |
| Export (text / PDF) | Happy path | Manual |
| Keyboard shortcuts | All mapped keys | Manual |
| Browser compatibility | Chrome, Firefox, Safari, Edge | Manual |
| Accessibility | ARIA, contrast, keyboard nav | Manual |
| Performance | Memory, spectrogram time | Manual with DevTools |

### Known Gaps and Accepted Risks

| Gap | Risk Level | Rationale |
|---|---|---|
| No automated integration tests (file decode end-to-end) | Medium | Requires browser automation (Playwright). Not worth building for a solo project at this stage. |
| LUFS validation against ITU-R test vectors | Medium | Published EBU Tech Doc 3341 test signals require specific WAV files not available in this repo. Unit tests use synthetic signals as approximation. |
| Level match gain clamp for extreme LUFS differences | High | A 60dB gain boost is theoretically possible. Should add a cap (e.g. ±12dB) before launch. |
| Spectrogram CPU on main thread | Medium | Long tracks may stutter. Documented as known risk. |
| Mobile drag precision for loop markers | Low | Touch targets are 16px wide. Acceptable for MVP. |
| PDF text overflow for long filenames | Low | jsPDF does not auto-wrap text. |

---

## 12. Running the Tests

### Automated Tests

1. Open `test-runner.html` in any modern browser
2. Tests execute immediately on load
3. Green rows = pass. Red rows = fail with error message.
4. Browser console shows additional detail for failing assertions.

No build step, no Node.js, no npm required.

### Manual Tests

1. Open `index.html` in the target browser
2. Work through each test case in the order listed
3. Mark pass/fail in your test log
4. For audio tests, use a pair of headphones to verify switching artifacts

### Recommended Test Audio Files

For repeatable manual tests, generate these synthetic files (e.g. with Audacity or ffmpeg):

```
test-24db-1khz.wav  — 1kHz sine at -24 dBFS, 10 seconds, 44100 Hz stereo
test-silence.wav    — 10 seconds of silence
test-short-5s.wav   — 1kHz sine, 5 seconds
test-long-180s.wav  — 1kHz sine, 3 minutes (to test seek range mismatch)
test-mono.wav       — 1kHz sine, mono, 10 seconds
test-96k.wav        — 1kHz sine, 96000 Hz sample rate, 10 seconds
```
