# Drop & Fuse

Neon orb merge puzzle — drop, match, fuse, don’t overflow the bin.

**Play:** https://jmitchell238.github.io/drop-and-fuse/

## Controls

| Input | Action |
|-------|--------|
| Drag + release | Aim and drop |
| ← → / A D | Move |
| Space / Enter / ↓ | Drop |
| Esc | Menu |

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

Covers drop rules (including the “first ball won’t drop” regression), merge/physics,
input aim helpers, version format, and HTML structure (no full-screen play overlay).

## Local

```bash
python3 -m http.server 8080
```
