# ✂︎ Match Cut Studio

A **text match-cut generator** that runs entirely in your browser. Type a word,
pick an aspect ratio, cycle a **different font on every frame**, choose a
background, add a typewriter / tick / riser sound effect, and **export a video or
transparent PNG frames** — all generated locally on your machine. Nothing is
uploaded to any server.

This is the "newspaper clipping" kinetic-typography effect: the same word flashes
rapidly, each frame in a mismatched font on a newsprint background, with the word
highlighted, synced to sound. What used to take hours in After Effects happens in
seconds here.

## Run it

No build step, no dependencies, no account. **Serve the folder** (recommended, so
the bundled fonts load reliably):

```bash
# from the project folder
python3 -m http.server 8000
# then open http://localhost:8000
```

Any static server works (`npx serve`, VS Code Live Server, etc.). Opening
`index.html` directly with `file://` also works in most browsers, but Chrome can
block local font files that way — if fonts look plain, use a local server.

> Use a Chromium-based browser (Chrome/Edge) for the best video-export support.

## Features

**Input & format**
- **Word / phrase** — highlighted and matched across every frame.
- **Aspect ratios** — 9:16, 16:9, 1:1, 4:5, 3:4, 2.35:1.
- **Resolution** — 720p, 1080p, or 4K.
- **Duration** — slider plus quick presets (0.8 / 1.5 / 2 / 3 / 5 s).
- **Speed** — frames-per-second and frames-per-font (lower = faster flicker).

**Fonts — a different one every frame**
- **30 trendy display fonts bundled locally** (Anton, Bebas Neue, Archivo Black,
  Oswald, Teko, Alfa Slab One, Fjalla One, Staatliches, Playfair, Bodoni, Abril
  Fatface, Bungee, Monoton, Shrikhand, and more) — all open-source (OFL) and
  **working fully offline**, no CDN.
- **Upload your own** `.ttf` / `.otf` / `.woff` / `.woff2` — they're added to the
  rotation. Any fonts on your system are used too.
- Shuffle to randomize the order.

**Backgrounds**
- **Newspaper** — newsprint with scattered filler text (the classic look).
- **Clean paper** — solid, just the hero word.
- **Dark** — modern dark background with light ink.
- **Green screen** — pure `#00FF00`, keys out cleanly in any editor.
- **Transparent** — no background; export PNG frames to keep the alpha channel.

**Look**
- Highlight styles: marker **box**, **underline**, **invert**, or none.
- Custom paper / ink / highlight colors.
- Film grain, position jitter, flash-flicker strobe, force UPPERCASE.

**Sound (all synthesized locally, work offline)**
- Typewriter clack, tick / shutter, camera burst, whoosh riser.
- Or **upload your own audio** (e.g. your "tick tick tick" transition).
- Fire on every frame for the machine-gun edit feel, or once from the start.

**Export**
- **`.webm`** video (VP9/VP8 + Opus audio) — drop straight into any editor.
- **PNG frames as a `.zip`** — with transparency when the Transparent background
  is selected. (The ZIP is built in-browser; no libraries.)
- **Single PNG** still.

Convert the webm to MP4 if you need it: `ffmpeg -i matchcut.webm matchcut.mp4`

## Tested

Verified end-to-end in a real Chromium browser (Playwright): all six aspect
ratios, all three resolutions, all five backgrounds, every sound option, and both
export paths (webm with audio + transparent PNG-frame zip) — no runtime errors.

## Files

| File | Purpose |
|------|---------|
| `index.html`      | UI layout + controls |
| `style.css`       | Dark editor styling |
| `app.js`          | Rendering, audio synthesis, video + frame export |
| `fonts/`          | 30 bundled OFL display fonts + `fonts.css` |

## Fonts & licensing

All bundled fonts are licensed under the SIL Open Font License (OFL) and are free
for personal and commercial use, including in exported videos.
