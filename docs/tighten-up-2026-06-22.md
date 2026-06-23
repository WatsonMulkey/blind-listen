# Blind Listen — Tighten-Up Review (2026-06-22)

Post-project review per the `/blueprint` pipeline (ADR-026). Inputs: `docs/ARCHITECTURE.md` (commit `53c84c6`) + parallel verify-in-code passes by `efficiency-shark` and `senior-dev-skeptic`. **Both reviewers completed full passes — this is dual-perspective coverage, not a half-review.** Every finding below was confirmed against source with `file:line`; leads that did not reproduce are listed at the end as negative signal.

**The pipeline modified no code.** Outputs are this report + `docs/ARCHITECTURE.md` + the Linear tickets listed in the ranked table.

## Headline
Two findings would block a release; both are cheap. **(1)** Exported text/PDF reports print a "CONSISTENT / DIFFERENT" verdict even when the user never reshuffled — a *fabricated claim in a user-facing deliverable*. **(2)** The ±12 dB level-match clamp (the ear-safety control) has zero real test coverage, and the only test that touches level-match asserts an *unclamped* hand-copied formula that has already drifted from source. Everything else is dormant index/state fragility (one feature-add from shipping) plus ~225–280 lines of drift-prone duplication.

## Ranked findings (impact × effort)

| # | Finding | Key files | Impact | Effort | Source | Ticket |
|---|---|---|---|---|---|---|
| 1 | Export consistency verdict emitted without the `hasReshuffled` guard the UI enforces; compounded by `firstPickFileIndex` staying set after an un-pick | `js/export.js:44,178`; `js/ui.js:86-94,359` | **High** — false claim in an exported report | **Low** | shark #3 + skeptic C2/S1 | FOI-522 |
| 2 | ±12 dB level-match clamp untested; test-runner hand-copy asserts an unclamped formula (already drifted) | `js/metering.js:125`; `test-runner.html:340-350,697-739` | **High** — ear-safety control, false test confidence | Low–Med | shark #2 + skeptic C1 | FOI-523 |
| 3 | Restart teardown resets ~25 globals by hand and misses `refGainNode`/`refSourceNode`/`audioCtx`; works today *only because the audio graph is never freed* | `js/app.js:134-180,358`; `js/ui.js:205` | Med — latent; breaks on any future memory cleanup | Med | shark #9 + skeptic S2 | FOI-524 |
| 4 | File indices aren't stable identities: `removeFile` splices index-aligned arrays without touching `mixLUFS/Peak/RMS/GainOffsets`; `spectrogramCache` keyed by file index | `js/app.js:300-307`; `js/metering.js:109`; `js/waveform.js:194` | Med — dormant index-desync, one feature-add from shipping | Low (guard) | skeptic S3/S4 | FOI-525 |
| 5 | Drift-prone duplication: dead `spectrogram-worker.js`, verbatim `audioCtx` init (×2), parallel ref-track transport (+4× teardown paste), export text/PDF data loop (×2) | `js/spectrogram-worker.js`; `js/waveform.js:57-105`; `js/ui.js:196-328,253-261`; `js/app.js:358-366`; `js/export.js:11-22,137-156` | Med — −225–280 lines, kills 3 "sync by hand" obligations | Low–Med | shark #1,#4,#5,#6 + skeptic S5/O1 | FOI-526 |
| 6 | Doc/hygiene: `qa-plan.md` stale on 3 load-bearing claims; "configurable session duration" documented but hardcoded; 2 stale mockups tracked despite the `mockup-*.html` ignore | `docs/qa-plan.md`; `js/app.js:49`; `CHANGELOG.md:23`; `mockup.html`, `mockup-player.html` | Low | Low | shark #7,#8,#11 + skeptic O2/O3/O4 | FOI-527 |
| — | UX judgment calls (escalated, not resolved): duration-mismatch flow both forbids and permits continuing; arrow-nav from `activeIndex = -1` jumps to a non-obvious mix | `js/app.js:393-396`; `js/ui.js:454-465,445-446` | Low (UX) | Low | shark #10 + skeptic S6 | report-only |
| — | Verified NOT bugs (negative signal): orphaned audio-node accumulation; Start-button wedge via the duration-warning suppression key | `js/audio-engine.js:4,58-64`; `js/app.js:387,403-405` | — | — | both reviewers | report-only |

---

## Detail

### 1. Export consistency verdict fires without a reshuffle (correctness bug) — FOI-522
The on-screen verdict is correctly gated on `hasReshuffled && firstPickFileIndex >= 0 && activeIndex >= 0` (`js/ui.js:359`). **Both export paths drop the `hasReshuffled` guard** — `js/export.js:44` (text) and `js/export.js:178` (PDF) gate on `firstPickFileIndex >= 0 && activeIndex >= 0` alone. Repro (state-traced by both reviewers): pick a mix → do **not** reshuffle → reveal → export. The UI shows no consistency block, but the report prints "CONSISTENT — same file picked both rounds" or "DIFFERENT…". The consistency check is *defined* as "did you pick the same mix before and after a reshuffle"; with no reshuffle there was no second round, so the verdict is fabricated — an affirmatively false statement in a document a user may hand to a client.

**Compounding (skeptic S1):** `toggleLock` sets `firstPickFileIndex` on pick (`js/ui.js:94`) but un-pick clears only `lockedBtnIndex`/`lockedFileIndex` (`js/ui.js:86-87`), not `firstPickFileIndex`. So even with the guard added, a pick→reshuffle→un-pick-everything sequence leaves a verdict referencing a retracted first-round pick (it's deliberately preserved through reshuffle at `:380`).

**Direction:** add `&& hasReshuffled` to `js/export.js:44` and `:178` so all three consumers share one invariant (the workspace "gate the invariant in every consumer / one value one source" pattern). Decide the un-pick semantics and reset `firstPickFileIndex` accordingly (at minimum clear it on un-pick when `!hasReshuffled`).

### 2. Ear-safety clamp untested; test asserts an unclamped, already-drifted formula — FOI-523
Production clamps the level-match gain: `js/metering.js:125` — `Math.max(-12, Math.min(12, targetLUFS - mixLUFS[i]))`. The test-runner hand-copy does **not**: `test-runner.html:347` — `const gainDB = targetLUFS - l;`, exercised by the only level-match tests (`test-runner.html:697-739`). So the one path the architecture calls ear-safety-relevant (audio into headphones; unbounded boost on a near-silent mix) is asserted only against an unclamped duplicate — the clamp itself has zero coverage, and a future change widening or dropping it passes 100% of tests. The harness comment (`test-runner.html:256-260`) admits the copies "must stay in sync"; this one already failed that.

**Direction:** assert the *production* clamp boundary directly — e.g. for a 67 dB delta the returned linear gain should equal `10^(12/20) ≈ 3.981`, not `10^(67/20)`. Structural fix (recommended by both): have `test-runner.html` load the real `js/metering.js` (and the other pure functions) instead of hand-copies, so drift is impossible. See FOI-526 for the shared-`pure.js` extraction this rides on.

### 3. Restart teardown incomplete — survives only because the audio graph is never freed — FOI-524
`js/app.js:134-180` manually resets ~25 globals but never nulls `refGainNode` (`js/app.js:36`), `refSourceNode` (`:37`), or `audioCtx`. It works today **by accident**: `audioCtx`/`gainNode` are guarded by `if (!audioCtx)` (`js/app.js:358`) and never rebuilt, so the old graph is reused intact. The moment anyone adds the natural memory cleanup (null/close `audioCtx` on restart), `refGainNode` becomes a dangling reference to a closed context and `playRef` silently no-ops or throws. Skeptic also flags `waveformVisible` not reset (`reshuffle`→`false` at `js/ui.js:410` can carry into the next session's Start, `js/app.js:126`).

**Direction:** either tear down fully and rebuild the graph on restart (null + close `audioCtx`, `gainNode`, `levelMatchGain`, `refGainNode`, `refSourceNode`), or factor `js/app.js:1-51` into one `state` object with `resetState()` re-initialized from a defaults template — which also closes finding #4's class.

### 4. File indices are not stable identities (dormant index-desync) — FOI-525
`removeFile` (`js/app.js:300-307`) splices `files`/`buffers`/`fileStates` by index, re-indexing everything after the removed slot, but does **not** touch `mixLUFS`/`mixPeak`/`mixRMS`/`mixGainOffsets` (keyed by file index, `js/metering.js:109`, applied at `js/audio-engine.js:21`) or `spectrogramCache` (keyed by file index, `js/waveform.js:194`). Safe **today** only because metering/spectrogram are computed at Start and removal lives exclusively on the pre-Start list. But this is precisely the button-position-vs-file-index confusion the architecture names as the central fragility: it is one "remove a mix mid-session" feature away from silently mapping level-match gains and spectrograms to the wrong file.

**Direction:** make the invariant explicit now — add a guard/assert at `removeFile` that it is valid only pre-Start (`!player.classList.contains('active')`), and a comment that any post-Start removal must re-run metering and rebuild `shuffleMap` + caches. Cheap insurance against a future correctness bug.

### 5. Drift-prone duplication (consolidation) — FOI-526
Four confirmed duplications, two of which have **already diverged**:
- **Dead `js/spectrogram-worker.js` (138 lines)** — byte-equivalent to the inline `SPECTROGRAM_WORKER_CODE` (`js/waveform.js:57-100`); the live worker is the Blob URL of the inline string (`:104-105`). The file is loaded by nothing; the comment at `index.html:1684` actively *lies* ("loaded via new Worker()"). Delete the file + comment (inline is the correct approach per the `file://` note at `waveform.js:56`).
- **`audioCtx` graph-init duplicated verbatim** — `js/app.js:358-366` == `js/ui.js:253-261` (8 lines). Extract `ensureAudioGraph()` in `audio-engine.js`.
- **Reference-track transport** — `playRef`/`tickSeekRef`/`getCurrentTimeRef` (`js/ui.js:196-249`) parallel `play`/`tickSeek`/`getCurrentTime` in `audio-engine.js`, sharing five mutable globals (`startedAt`, `isPlaying`, `pausedAt`, `animFrame`, …) with guard logic split across two files; ref teardown pasted 4× (`js/ui.js:188-190,201-202,291,310`). At minimum extract `stopRefSource()` + a shared `wrapLoopTime()`; the right end-state is a buffer/gain-parameterized engine (`play(t, buffer, gainNode)`) — **larger refactor, gate on browser verification.**
- **Export text vs PDF** rebuild the same metering-format + consistency loop twice (`js/export.js:11-22` vs `:137-156`; `:44-52` vs `:178-190`); the PDF path even drops RMS the text path includes. Extract `getMixRows()` + `getConsistencyVerdict()` — and finding #1's `hasReshuffled` fix then lands in exactly one place.

Net ≈ −225–280 lines and the removal of three "keep two copies in sync by hand" obligations; two of the three have already bitten.

### 6. Doc / hygiene — FOI-527
- `docs/qa-plan.md` (dated 2026-03-26, predates the build) is stale on 3 load-bearing points: claims `role="radio"` mix buttons (code: container `role="toolbar"` + `aria-pressed`, `js/ui.js:11,51`); cites `--bg-base: #09090f` and computes contrast from it (actual `#08080e`, `index.html:31`); lists the ±12 dB clamp as an unimplemented "High" risk though it exists (`js/metering.js:125`). A QA plan that misstates the clamp status is how an untested safety control gets signed off as "covered."
- "Configurable session duration" (`CHANGELOG.md:23`, CLAUDE.md) but `sessionSeconds` is hardcoded `600` (`js/app.js:49`, `:179`) with no UI — soften the changelog or build the knob (**roadmap call, Watson**).
- `mockup.html` + `mockup-player.html` are tracked despite `.gitignore` `mockup-*.html` (added after they were committed); nothing links to any mockup. `git rm --cached` them or whitelist intentionally.

### UX judgment calls (escalated — not resolved)
- **Duration-mismatch contradictory affordances:** on >10% mismatch, `js/app.js:393-396` hides Start, shows "Please upload your files again", forces Restart (hard block) — yet `js/ui.js:454-465` lets the user dismiss and proceed (soft warning). Same condition both forbids and permits. Pick one affordance. *(The "wedged Start button" half of the original lead did NOT reproduce — see below.)*
- **Arrow-nav from `activeIndex = -1`:** after reshuffle or in ref mode `activeIndex = -1`; `ArrowLeft` → `(activeIndex - 1 + readyCount) % readyCount` lands on the middle mix (`js/ui.js:445-446`), and from REF silently yanks the user into a blind mix. No crash. Probably should deterministically land on mix 0.

### Verified NOT bugs (negative signal — do not "fix")
- **Orphaned audio-node accumulation** (original Lead #10): does not reproduce. `play()` calls `stop()` first (`js/audio-engine.js:4`); `stop()` nulls `onended`, stops, `disconnect()`s, and nulls `sourceNode` (`:58-64`). One-shot sources are the correct idiom; disconnected nodes are GC-eligible. No pooling needed — don't add any.
- **Start-button wedged hidden via the duration-warning suppression key** (original Lead #11): does not reproduce. `durationWarningDismissed` only *suppresses* the warning (`js/app.js:387`); the path falls through to show Start for `readyCount >= 2` (`:403-405`), the dismiss handler re-shows Start, and Restart clears the key (`:162`). The contradictory-affordance *UX smell* is real (escalated above); the correctness wedge is not.

## Provenance
- Architectural brief: `docs/ARCHITECTURE.md` @ `53c84c6`
- Reviewers: `efficiency-shark` (agent `a6420149bceb25daf`), `senior-dev-skeptic` (agent `a031056849411908d`) — both verify-in-code, read-only.
- This report committed to `main`; tickets FOI-522…527 (label: Blind Listen).
