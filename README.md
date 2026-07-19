# Drop & Fuse

Neon orb merge puzzle — drop, match, fuse, don’t overflow the bin.

**Play:** https://jmitchell238.github.io/drop-and-fuse/

## Controls

| Input | Action |
|-------|--------|
| Drag left/right + release | Choose drop column (always falls straight down) |
| ← → / A D | Move |
| Space / Enter / ↓ | Drop |
| Esc | Menu |

**Fuse rule:** two orbs of the **same size/color** fuse when they **touch**.
Three in a pile still fuse two at a time. Orbs show **names** (Spark, Mint…), not mystery numbers.

## Stack

Static HTML/CSS/Canvas + custom circle physics. Installable PWA (`manifest` + service worker). Progress in `localStorage`.

## Versioning

Same scheme as VoidRush (`hole-game`):

- `GAME_VERSION` in `js/config.js` — `MAJOR.MINOR.PATCH` (patch zero-padded to 3 digits)
- UI shows `Drop & Fuse v…` (corner tag + menu / game-over lines)
- Keep `CACHE` in `sw.js` in sync: `'drop-and-fuse-' + GAME_VERSION`
- SW + remote `config.js` version check auto-reload when not mid-game

## Tests

```bash
node tests/run.mjs
```

Covers:

- First-drop / iPad input regression
- Merge, chain merge, max-tier no-merge
- Physics (fall, settle, walls)
- Danger-line game over
- Save / high score persistence
- Version ↔ service worker cache sync
- PWA shell (no full-screen play overlay)

## Local

```bash
python3 -m http.server 8080
```
