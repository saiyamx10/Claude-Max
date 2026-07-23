# ✂︎ Match Cut Studio

A **text match-cut generator** that runs entirely in your browser. Type a word,
pick an aspect ratio, cycle a **different font on every frame**, add a typewriter /
tick / riser sound effect, and **export a video** — all generated locally on your
machine. Nothing is uploaded to any server.

This is the "newspaper clipping" kinetic-typography effect: the same word flashes
rapidly, each frame in a mismatched font on a newsprint background, with the word
highlighted, synced to sound. What used to take hours in After Effects happens in
seconds here.

## Run it

No build step, no dependencies, no account. Either:

- **Just open `index.html`** in Chrome, Edge, or Firefox (double-click it), **or**
- Serve the folder so uploaded fonts/audio load cleanly:

  ```bash
  # from the project folder
  python3 -m http.server 8000
  # then open http://localhost:8000
  ```

> Use a Chromium-based browser (Chrome/Edge) for the best video export support.

## How to use

1. **Word / phrase** — the word that gets matched and highlighted every frame.
2. **Aspect ratio** — `9:16`, `16:9`, `1:1`, or `4:5`.
3. **Frames / second** and **Frames per font** — control the flicker speed.
   Lower "frames per font" = faster, more aggressive cuts.
4. **Duration** — length of the clip in seconds.
5. **Your fonts** — upload `.ttf` / `.otf` / `.woff` / `.woff2`. Every uploaded
   font is added to the rotation, so **each frame uses a different font**. The app
   also ships with ~40 built-in fonts (Google + system) so it looks varied even
   before you add your own. Turn on *Shuffle* to randomize the order.
6. **Sound effect** — built-in **Typewriter clack**, **Tick/shutter**, or **Whoosh
   riser** (all synthesized locally, work offline), or upload your **own audio file**
   (e.g. your "tick tick tick" transition). "Trigger on every frame" fires the sound
   on each font change for that machine-gun edit feel.
7. **▶ Preview** to watch it, **⬇ Export video** to save a `.webm`, or **Save PNG
   frame** for a still.

## Notes

- Export produces a `.webm` (VP9/VP8 + Opus). Drop it straight into any editor
  (Premiere, CapCut, DaVinci, etc.). To convert to MP4:
  `ffmpeg -i matchcut.webm matchcut.mp4`
- Fully offline once loaded — the only network use is the optional Google Fonts
  `<link>` in `index.html` for extra font variety. Remove that line to go 100%
  offline; the built-in system fonts still give plenty of mismatched variety.
- All rendering uses `<canvas>`, all audio uses the Web Audio API, and export uses
  `MediaRecorder` capturing the canvas + audio streams. No data leaves your browser.

## Files

| File | Purpose |
|------|---------|
| `index.html` | UI layout + controls |
| `style.css`  | Dark editor styling |
| `app.js`     | Rendering, audio synthesis, and video export logic |
