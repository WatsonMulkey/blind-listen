# Changelog

All notable changes to Blind Listen. Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [1.1.0] — 2026-05-17

### Added
- **Ableton integration** — open Blind Listen as a floating window from inside your Live session via the new [Web Launcher](https://weblauncher.foil.engineering) Max for Live device. Supports up to 5 of your most-used URLs (Blind Listen comes preloaded). Requires Live 12 Suite (or Standard + Max for Live).

## [1.0.0] — 2026-04-12

First tagged release. The app has been live and usable for weeks; this snapshot captures the state after the design-polish pass and Drew's beta feedback.

### Features
- Load 2–5 audio files (WAV, MP3, FLAC, M4A, AAC, OGG, AIFF). Files stay in your browser — nothing uploads.
- Blind A/B/C/D/E switching with hidden identities; reveal when you're ready.
- Lock-in pick + reshuffle for consistency check — are you really picking the same mix twice?
- Reference track (REF) slot for a known-good comparison.
- LUFS metering (ITU-R BS.1770-4), peak, and RMS.
- Level matching so loudness doesn't bias your ears.
- Spectrogram view (Web Worker-computed so the UI stays smooth).
- Section looping with markers and re-roll.
- Session timer with configurable duration.
- Notes panel + export to text or PDF (via jsPDF).
- Keyboard shortcuts: `1–5` mixes, `0` reference, `Space` play/pause, `L` loop, `M` level match, `R` reveal.
- Light/dark mode toggle.
- Onboarding overlay + help button for first-time users.
- Accessibility: ARIA live announcements, keyboard navigation, screen-reader support on mix buttons and file input.
- Works on desktop Chrome, Firefox, Safari, Edge.

### Known limits
- Free tier only. Paid-tier features (cloud sync, shared sessions) are Phase 2/3.
- No mobile-specific layout yet.
