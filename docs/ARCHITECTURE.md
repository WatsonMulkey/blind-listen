# Blind Listen — Architecture Brief

> Generated artifact (Blueprinter). Maps the system **as built**, every structural claim cited to `file:line`. Where a cited line conflicts with prose in `CLAUDE.md`, `CHANGELOG.md`, or `docs/qa-plan.md`, this brief records what the code does and flags the stale doc. Prior versions of this file live in git history.

---

## 1. System Overview

Blind Listen is a **single-page, 100% client-side browser tool for unbiased A/B(/C/D/E) mix comparison**. A music producer drops 2–5 audio files; the app decodes them in-browser, randomly assigns them to anonymous buttons labelled X / Y / Z / W / V (`js/app.js:2`, `js/app.js:408`), and lets the user switch between them at a synced playback position with their identities hidden. The user can loop a section, level-match loudness, view a waveform or spectrogram, "Pick" a favorite, reshuffle to test whether they pick the same file twice (a consistency check), take per-mix notes, then **Reveal** the filenames and export the session as text or PDF.

**Mental model:** There is no backend. The entire application is `index.html` (markup + all CSS + theme/inline scripts) plus eight `<script>`-tag modules in `js/` that share one flat global scope. State is a set of module-level `let` globals in `js/app.js:1-51`; there is no framework, no build step, no bundler, no `package.json`. The only external runtime dependency is the **jsPDF** library, loaded from a CDN for PDF export (`index.html:1683`). Files never leave the browser (`index.html:1644`; no `fetch`/XHR/WebSocket exists anywhere in the source — verified by grep).

**Users:** Solo producers / mix engineers comparing revisions of the same song. A v1.1.0 footer link (`index.html:1647`) targets Ableton users via an external "Web Launcher" Max-for-Live device that opens this URL as a floating window.

---

## 2. Stack & Runtime Topology

| Layer | Technology | Evidence |
|---|---|---|
| Markup + styling | One `index.html`; all CSS inline in a single `<style>` block | `index.html:15-1499` |
| App logic | Vanilla ES (no modules/imports); 8 plain scripts sharing global scope | `index.html:1685-1692`, `index.html:1732` |
| Audio | Web Audio API: `AudioContext`, `OfflineAudioContext`, `IIRFilterNode`, `GainNode`, `AudioBufferSourceNode` | `js/app.js:359`, `js/metering.js:34-37`, `js/audio-engine.js:16` |
| Visualization | 2D Canvas (waveform) + a Blob-URL Web Worker for spectrogram FFT | `js/waveform.js:9`, `js/waveform.js:102-108` |
| PDF export | jsPDF 2.5.1 UMD via cdnjs | `index.html:1683`, `js/export.js:110-111` |
| Analytics | Vercel Web Analytics + Speed Insights (deferred scripts) | `index.html:1733-1734` |
| Persistence | Browser `localStorage` (theme, onboarding-seen) + `sessionStorage` (duration-warning-dismissed). No cookies, no IndexedDB. | `index.html:1700`, `js/onboarding.js:18`, `js/ui.js:456` |

**Runtime topology:** Pure static hosting. Hosted on Vercel project `blind-listen` (`.vercel/project.json`, untracked). There is **no `vercel.json`, no serverless function, and no API directory in this repo** — the `foil.engineering/blindlisten` rewrite described in `CLAUDE.md:17` lives in the separate `foil-industries-v2` repo, not here. The app also runs directly from the filesystem (`file://`) — the spectrogram worker is deliberately built from an inline Blob URL to sidestep `file://` cross-origin worker restrictions (`js/waveform.js:51`, `js/waveform.js:56`).

**Script load order matters** because everything is global and runs top-to-bottom: `app.js` defines state + DOM refs + upload handlers, then `audio-engine.js`, `waveform.js`, `loop.js`, `metering.js`, `timer.js`, `ui.js`, `export.js`, then the inline theme IIFE, then `onboarding.js` (`index.html:1685-1732`). Each module attaches its own event listeners at load time (e.g. `js/metering.js:165`, `js/loop.js:76-77`, `js/ui.js:286`).

---

## 3. Module Map

All modules share one global namespace; "public interface" below means the functions/state other modules call, not exported symbols.

### `js/app.js` (419 lines) — State, DOM refs, upload, shuffle
The spine. Declares **every** shared global: file/buffer arrays, audio nodes, playback state, metering arrays, lock-in state, ref-track state, spectrogram state, loop/timer state (`js/app.js:1-51`). Caches **all** DOM references (`js/app.js:53-104`). Owns the upload pipeline `handleFiles()` (`js/app.js:334`) which filters by MIME or extension, enforces the 2–5 file cap (`js/app.js:344`), lazily constructs the `AudioContext` + gain graph on first file (`js/app.js:358-366`), decodes each file sequentially via `decodeAudioData` (`js/app.js:371-379`), and runs the >10% duration-mismatch check (`js/app.js:384-400`). Owns the **Start Listening** transition (`js/app.js:107-131`) and full **Restart** teardown (`js/app.js:134-180`), and `shuffle()` (Fisher–Yates over ready file indices, `js/app.js:408`). Depended on by every other module.

### `js/audio-engine.js` (117 lines) — Transport core
`play()` / `pause()` / `stop()` and the time model. `play()` creates a fresh `AudioBufferSourceNode` per call, wires it `source → levelMatchGain → gainNode → destination`, applies the per-mix level-match gain, sets loop points, and starts at a clamped offset (`js/audio-engine.js:16-51`). `getCurrentTime()` implements loop-modulo wrapping (`js/audio-engine.js:71-81`). `getActiveDuration()` / `getShortestDuration()` are the fix for the historical "global duration" seek bug (`js/audio-engine.js:83-95`). `tickSeek()` is the `requestAnimationFrame` UI sync loop (`js/audio-engine.js:97`). Consumed by `ui.js`, `loop.js`, `waveform.js`.

### `js/metering.js` (165 lines) — LUFS / peak / RMS / level match
Self-contained ITU-R BS.1770-4 implementation: two-stage K-weighting IIR coefficients (`js/metering.js:4-27`), gated loudness via `OfflineAudioContext` rendering with 400 ms blocks / 100 ms hops and absolute (−70) + relative (−10 dB) gates (`js/metering.js:29-79`), plus peak dBFS and RMS dB (`js/metering.js:81-103`). `computeAllMetering()` runs all buffers in parallel and derives level-match gain offsets toward the **mean LUFS**, **clamped to ±12 dB** (`js/metering.js:125`). `renderMixStats()` paints the LUFS/dBFS row (`js/metering.js:132`). Wires its own button listener (`js/metering.js:165`).

### `js/waveform.js` (267 lines) — Waveform + spectrogram rendering
`drawWaveform()` peak-picks channel 0 into ≤600 bars on a DPR-scaled canvas (`js/waveform.js:3-47`). Spectrogram path: an **inline worker source string** `SPECTROGRAM_WORKER_CODE` (radix-2 FFT, Hann window, log-frequency mapping, dB→color ramp — `js/waveform.js:57-100`) instantiated lazily from a Blob URL (`js/waveform.js:102-108`), with stale-result discarding via `_spectrogramPendingIdx` and an `ImageData` cache keyed by buffer index (`js/waveform.js:130-175`). `redrawActiveVisual()` is the dispatcher (`js/waveform.js:188`). Owns waveform/spectrogram toggles, debounced resize invalidation, and click-to-seek (`js/waveform.js:201-267`).

### `js/loop.js` (159 lines) — Loop region control
Enable/disable, default 0–30 s region with 5 s minimum (`js/loop.js:3-32`), randomized re-roll (`js/loop.js:34-50`), text-input parsing with clamping (`js/loop.js:79-100`), and pointer/touch marker dragging on the waveform (`js/loop.js:103-159`). All loop length math uses `getShortestDuration()` so a loop never exceeds the shortest mix.

### `js/ui.js` (465 lines) — UI assembly, switching, reveal, reshuffle, keyboard, ref track
`buildUI()` builds the REF button, mix buttons, "Pick" buttons, and note rows (`js/ui.js:9-79`). `switchTo()` is the core blind-switch: preserve position, stop, swap active index, re-clamp loop, redraw, resume if playing (`js/ui.js:113-154`). Owns the entire **reference-track subsystem** (its own gain node + source node + tick loop, parallel to the main engine — `js/ui.js:156-271`), the **Reveal** handler with `confirm()` gate and consistency result (`js/ui.js:337-368`), the **Reshuffle** handler that resets position/loop/waveform/notes (`js/ui.js:372-423`), and the **global keyboard map** (`js/ui.js:435-450`). Also home to `escapeHTML()`, the app's only XSS guard for filename injection (`js/ui.js:3-7`).

### `js/export.js` (199 lines) — Text + PDF export
`buildExportText()` assembles the plain-text report (assignments, metering, notes, consistency, ref) (`js/export.js:4-63`). Clipboard copy with a `document.execCommand` fallback (`js/export.js:70-89`), `.txt` Blob download (`js/export.js:92-102`), and jsPDF generation with a `typeof window.jspdf === 'undefined'` guard (`js/export.js:105-199`).

### `js/timer.js` (57 lines) — Session timer
Hardcoded 600 s countdown (`sessionSeconds` initialized in `js/app.js:49`), warning/critical thresholds at 120/30 s, screen-reader announcements, and auto-pause at zero (`js/timer.js:5-50`).

### `js/onboarding.js` (42 lines) — First-run modal
Self-contained IIFE; shows the welcome modal once (guarded by `localStorage`), re-openable via the help button, dismiss on backdrop/Escape (`js/onboarding.js:4-42`).

### `js/spectrogram-worker.js` (138 lines) — **DEAD / orphaned**
A standalone copy of the spectrogram FFT worker. It is **never loaded**: the live worker is built from the inline `SPECTROGRAM_WORKER_CODE` string in `waveform.js`, not from this file. The only reference to it is an HTML comment (`index.html:1684`). Tracked in git but vestigial. See Review Leads.

---

## 4. Data Flow & State

**Single source of truth:** module-level globals in `js/app.js:1-51`. There is no store, no reactivity — the UI is updated by direct DOM mutation from each handler.

Core arrays are **index-aligned**: `files[]`, `buffers[]`, `fileStates[]` share a file index `i` (`js/app.js:3-5`, populated `js/app.js:351-355`). `shuffleMap[]` maps **button position → file index** (`js/app.js:414-418`); `activeIndex` is a **button position** (`js/app.js:10`), so the active file is always `buffers[shuffleMap[activeIndex]]` (`js/audio-engine.js:11`). The five metering arrays (`mixLUFS`, `mixPeak`, `mixRMS`, `mixGainOffsets`) are indexed by **file index**, not button position (`js/metering.js:106-109`), which is why `renderMixStats()` and exports translate through `shuffleMap[i]` (`js/metering.js:135`, `js/export.js:12`).

**Audio graph** (built once, `js/app.js:358-366`):
```
AudioBufferSourceNode (per play) → levelMatchGain → gainNode → destination
                                    (per-mix dB)     (volume)
```
The reference track runs a **parallel** path: `refSourceNode → refGainNode → gainNode` (`js/ui.js:205-211`), bypassing `levelMatchGain` so the reference is never level-matched.

**Consistency-check state machine** (the most branch-heavy logic): `lockedBtnIndex` / `lockedFileIndex` / `firstPickFileIndex` / `hasReshuffled` (`js/app.js:26-31`). Pick → records `firstPickFileIndex` (`js/ui.js:92-94`); Reshuffle → preserves `firstPickFileIndex`, clears the lock, re-shuffles (`js/ui.js:379-392`); Reveal → compares the file behind the **currently active** button to `firstPickFileIndex` (`js/ui.js:359-367`). Note that the consistency result is only gated on `hasReshuffled` in the UI (`js/ui.js:359`) but **not** in the export, which fires on `firstPickFileIndex >= 0` alone (`js/export.js:44`) — see Review Leads.

**Persistence (the only durable state):**
- `localStorage['blind-listen-theme']` — light/dark choice, applied pre-paint (`index.html:13`, `index.html:1728`).
- `localStorage['blind-listen-onboarding-seen']` — first-run flag (`js/onboarding.js:5`, `:18`).
- `sessionStorage['durationWarningDismissed']` — suppresses the duration warning for the tab session (`js/ui.js:456`, read `js/app.js:387`).

Everything else (buffers, notes, picks, metering) is **in-memory only** and lost on reload or Restart (`js/app.js:134-180`).

---

## 5. External Integrations

This is a self-contained app; "integrations" are thin and all outbound:

1. **jsPDF (CDN, runtime dependency).** `https://cdnjs.cloudflare.com/.../jspdf/2.5.1/jspdf.umd.min.js` (`index.html:1683`). Contract: exposes `window.jspdf.jsPDF`. PDF export degrades gracefully if it fails to load (`js/export.js:106-109`). Pinned to 2.5.1 because 2.5.2 was never published to cdnjs (commit `07fa034`).
2. **Vercel Analytics + Speed Insights.** Deferred scripts from `/_vercel/...` (`index.html:1733-1734`) — only resolve when served from Vercel; no-ops on `file://`.
3. **Ableton "Web Launcher" (v1.1.0).** A footer link to `https://weblauncher.foil.engineering` (`index.html:1647`). **The integration boundary is purely a URL.** The Max-for-Live device (the binary `downloads/!! Web Launcher.amxd`, untracked/gitignored) opens this site in a floating window; this repo contains no code that detects, talks to, or is aware of Ableton. The `.amxd` is a shipped artifact stored here, not source.
4. **Ko-fi.** Outbound support links (`index.html:1623`, `:1656`).
5. **Google Fonts.** Outfit / DM Sans / JetBrains Mono via preconnect + stylesheet (`index.html:8-10`).

There is **no auth, no payment, no API, no third-party SDK** beyond the above. The Supabase/Polar.sh/R2/Realtime stack named in `CLAUDE.md:10-11` is **Phase 2/3 aspiration with zero code present**.

---

## 6. Cross-Cutting Concerns

**Error handling.** Decode failures are caught per-file and surfaced as an error row, never crashing the batch (`js/app.js:376-379`). Audio-node `stop()` calls are wrapped in `try/catch` that now `console.warn` rather than swallow (`js/audio-engine.js:61`, `js/ui.js:188`, and repeated in ui.js). PDF export guards on library presence (`js/export.js:106`). No global `window.onerror` handler; no user-facing error toast system.

**Security posture.** Minimal attack surface (no server, no network input). The one injection vector is user-controlled **filenames** rendered into the DOM; mitigated by `escapeHTML()` for file-list status and REF labels (`js/app.js:243`, `js/ui.js:22`, `:70`). **However**, the reveal handler writes the raw filename via `btn.textContent` (`js/ui.js:348`) — `textContent` is safe by construction, so this is fine, but note it does NOT route through `escapeHTML`. Clipboard/PDF/txt export embed filenames as plain text (safe). No CSP meta tag is set.

**Config / env.** None. No environment variables, no config file. Tunables are hardcoded literals: 5-file cap (`js/app.js:344`), 600 s session (`js/app.js:49`), 1.10 duration ratio (`js/app.js:390`), ±12 dB level-match clamp (`js/metering.js:125`), 5 s loop minimum (`js/loop.js:21`), 2048/512 FFT size/hop (`js/waveform.js:142-143`).

**Accessibility.** Substantial and load-bearing: `aria-pressed` on toggles, `aria-live` regions for file status and SR announcements (`index.html:1515`, `:1640`), `aria-valuetext` on the seek bar updated each tick (`js/audio-engine.js:102`), keyboard-operable upload zone (`js/app.js:312`), `prefers-reduced-motion` handling (`index.html:1278`), and focus management in the onboarding modal (`js/onboarding.js:13`).

**Offline / PWA.** Not a PWA — no service worker, no manifest. It is "offline-capable" only in the trivial sense that, once the page and jsPDF are loaded, no further network is needed.

---

## 7. Build, Test & Deploy

**Build.** None. There is no build step, no `package.json`, no bundler. Ship = the static files as-is. `index.html` opens directly via double-click (`CLAUDE.md:34`).

**Test.** `test-runner.html` (1352 lines) is a **self-contained in-browser unit harness** — open it and tests run on load (`test-runner.html:1349`). It covers **pure functions only**: `fmt`/`parseTime`/`fmtSize`, peak/RMS, level-match offsets, K-weighting coefficients (with EBU 48 kHz reference values), LUFS via `OfflineAudioContext` on synthetic signals, the radix-2 FFT (Parseval + single-bin), Fisher–Yates distribution, `getCurrentTime` loop modulo, loop re-roll invariants, Hann window, export-text formatting, file-validation predicates, duration-mismatch threshold, and timer thresholds.

**Critical test caveat:** the harness does **not** import the source — it holds hand-copied duplicates of the production functions (`test-runner.html:257-261` says so explicitly). These can and do drift from source. Concretely:
- `computeLevelMatchOffsets()` in the test (`test-runner.html:340-350`) has **no ±12 dB clamp**, but the production `computeAllMetering()` **does** clamp (`js/metering.js:125`). The tests therefore never exercise the real clamp behavior.
- All DOM-touching logic — switching, reveal, reshuffle, the entire audio engine wiring, loop dragging, ref track, export I/O — is **untested by the harness** and is covered only by the manual checklist in `docs/qa-plan.md` (§3–§9). No browser-automation (Playwright) tests exist; `docs/qa-plan.md:1291` calls this an accepted gap.

**Deploy.** Push to `main` → Vercel auto-deploy for project `blind-listen` (`CLAUDE.md:14-18`). Direct URL `blind-listen.vercel.app`; the `foil.engineering/blindlisten` path is a rewrite owned by the separate `foil-industries-v2` repo (not in this repo). `.gitignore` excludes `.vercel/`, `node_modules/`, `*.png`, `mockup-*.html`, and `downloads/`.

---

## 8. Dependency Inventory

**Runtime (1 external):**
- **jsPDF 2.5.1** (CDN) — the *only* third-party runtime dependency; exists solely for the "Download PDF" export path (`js/export.js:110`). Pinned to 2.5.1 (2.5.2 absent from cdnjs). Everything else (FFT, LUFS, waveform, audio) is hand-rolled with zero libraries.

**Dev / tooling:** none. No npm, no test framework (the harness is bespoke), no linter, no TypeScript.

**Loaded-but-non-essential:** Google Fonts (`index.html:10`) — cosmetic; Vercel Analytics/Speed Insights (`index.html:1733`) — telemetry only.

**Vestigial:** `js/spectrogram-worker.js` is a maintained-looking source file that is never wired in (see §3 and Review Leads). `downloads/!! Web Launcher.amxd` is a shipped binary artifact, not a dependency.

---

## 9. Conventions & Idioms

- **Flat global module pattern.** No `import`/`export`, no IIFE wrapping for the core modules (only `onboarding.js` and the theme block are IIFEs). Functions and `let` state are top-level globals shared by load order (`index.html:1685-1732`). A new module must be added as a `<script>` tag in dependency order.
- **Section banners.** Every module opens with a `// ─── Name ───` comment header (e.g. `js/audio-engine.js:1`, `js/metering.js:1`).
- **DOM-ref caching at top of `app.js`.** All `getElementById` calls are centralized (`js/app.js:53-104`); modules reference those globals rather than re-querying.
- **Index discipline.** Button position vs file index is the central invariant — `shuffleMap[buttonPos] → fileIndex`. Metering arrays use file index; UI uses button position. Get this wrong and labels mismatch metering.
- **HTML entities for glyphs.** Icons are HTML entities (`&#9654;` play, `&#9646;&#9646;` pause) set via `innerHTML` (`js/audio-engine.js:38`), not SVG or icon fonts.
- **`PAID_GATE` markers.** Comment sentinels mark the three intended free/paid boundary points — LUFS metering, lock-in reshuffle, PDF export — all currently ungated (`js/metering.js:2`, `js/app.js:27`, `js/ui.js:82`, `js/export.js:2`). These are the seams for any future monetization.
- **"Build a mockup first" workflow.** The repo embeds standalone HTML design mockups (`mockup.html` header, `mockup.html:1-24`) reflecting Watson's documented build-mock-then-apply pattern.
- **Time format.** `fmt()` shows tenths only when the fractional part ≥ 0.05 (`js/app.js:195`); `parseTime()` accepts `m:ss(.s)` or bare seconds (`js/app.js:201`).

---

## 10. Review Leads

For the downstream `efficiency-shark` and `senior-dev-skeptic` verify-in-code pass. Each is an observation with a citation, ranked roughly by signal. No recommendations.

1. **Duplicated spectrogram worker — one copy is dead.** `js/spectrogram-worker.js` (138 lines) is byte-equivalent logic to the inline `SPECTROGRAM_WORKER_CODE` string in `js/waveform.js:57-100`, but is **never loaded** — the live worker is a Blob URL of the inline string (`js/waveform.js:104-105`); the file is referenced only by an HTML comment (`index.html:1684`). Two sources of the same FFT/color logic that can silently diverge.

2. **Test harness duplicates source and has already drifted.** `test-runner.html:257-261` keeps hand-copied copies of production functions. The copied `computeLevelMatchOffsets` (`test-runner.html:340-350`) has **no ±12 dB clamp** while production `computeAllMetering` **does** (`js/metering.js:125`) — so the most safety-relevant metering behavior (gain clamping, called out as an ear-damage risk in `docs/qa-plan.md:955`) is asserted only against an unclamped duplicate. The clamp itself is untested.

3. **Consistency-check gating differs between UI and export.** The on-screen consistency result requires `hasReshuffled` (`js/ui.js:359`), but the exported text/PDF emits a consistency verdict on `firstPickFileIndex >= 0 && activeIndex >= 0` alone (`js/export.js:44`, `:178`) with no `hasReshuffled` guard — so an exported report can claim "CONSISTENT/DIFFERENT" in a state where the UI shows nothing. Verify whether a pick-without-reshuffle, then reveal+export, produces a misleading verdict.

4. **Reference-track engine is a parallel near-duplicate of the main transport.** `js/ui.js:196-249` reimplements play/tick/getCurrentTime (`playRef`, `tickSeekRef`, `getCurrentTimeRef`) alongside the originals in `js/audio-engine.js`, and the play-button and seek-bar handlers branch on `refActive` with copy-pasted stop/disconnect blocks (`js/ui.js:286-328`). High coupling and duplicated loop-modulo math (`js/ui.js:244` vs `js/audio-engine.js:74`).

5. **`ui.js` is the complexity hotspot (465 lines).** It owns switching, reveal, reshuffle, keyboard, ref track, and notes in one file. `index.html` is 1736 lines with ~1485 lines of inline CSS in a single `<style>` block (`index.html:15-1499`). These two files concentrate most of the surface area and most of the cross-cutting state mutation.

6. **`docs/qa-plan.md` has stale claims that no longer match code.** It asserts mix buttons use `role="radio"` (`docs/qa-plan.md:1114`) but the code sets `role="toolbar"` on the container with plain `aria-pressed` buttons (`js/ui.js:11`, `:51`); it cites `--bg-base: #09090f` (`docs/qa-plan.md:1138`) but the actual token is `#08080e` (`index.html:31`); and it flags the level-match clamp as an unimplemented "High" risk (`docs/qa-plan.md:955`, `:1293`) though the clamp exists (`js/metering.js:125`). The QA plan is dated 2026-03-26, predating these changes.

7. **Two tracked mockups are stale and orphaned; four more exist untracked.** `mockup.html` (last touched in the original MVP commit `4aad748`, 2026-03-24) and `mockup-player.html` (UX-overhaul commit `1872c67`, 2026-04-02) are committed but predate the `mockup-*.html` gitignore rule (commit `46eff66`); nothing in `index.html` links to any mockup. Four others (`mockup-kofi.html`, `mockup-session.html`, `mockup-integrations-footer.html`) are present on disk but untracked. Determine whether the two tracked ones should be retired from the repo.

8. **"Configurable session duration" is documented but not built.** `CHANGELOG.md:23` and `CLAUDE.md` imply a configurable timer, but `sessionSeconds` is a hardcoded 600 with no UI to change it (`js/app.js:49`, `js/timer.js`). Possible dead/aspirational feature surface.

9. **Restart teardown is a long manual reset that must stay in sync with state.** `js/app.js:134-180` hand-resets ~25 globals. Any new piece of state added to `app.js:1-51` must be mirrored here or a stale value survives a Restart. Verify completeness against the current global list (e.g. `spectrogramMode`, `lastAnnouncedThreshold`, and `refGainNode`/`refSourceNode` are reset inconsistently — `refGainNode` is **not** nulled on restart).

10. **Per-`play()` source-node creation with no explicit lifecycle pooling.** Every play/seek/switch builds a new `AudioBufferSourceNode` and relies on `onended`/`stop()` for cleanup (`js/audio-engine.js:16-69`). Rapid switching is handled by `stop()`-before-`play()`, but confirm no orphaned nodes accumulate under the fast-click path (`docs/qa-plan.md:1195` PERF-005 covers this manually only).

11. **Defensive layer worth a second look:** the duration-mismatch flow forces a hard "Please upload your files again" + Restart (`js/app.js:393-396`) yet is dismissible to proceed anyway (`js/ui.js:454-465`) — two contradictory affordances for the same condition. Verify the intended UX and whether the `sessionStorage` suppression key can wedge the Start button hidden.
