# Drop & Fuse

A neon orb-merge puzzle. Drop orbs into the bin, fuse matching ones into bigger ones, and don't let the pile overflow.

Play at https://jmitchell238.github.io/drop-and-fuse/

## Controls

| Input | Action |
|-------|--------|
| Drag left/right, then release | Pick a column and drop (orbs fall straight down) |
| ← → / A D | Move |
| Space / Enter / ↓ | Drop |
| Esc | Menu |

Two orbs of the same size and color fuse when they touch. If three end up together, they fuse two at a time. Each orb size has a name (Spark, Mint, and so on) instead of a number.

## Running locally

```bash
python3 -m http.server 8080
```

Then open http://localhost:8080.

Plain HTML, CSS and canvas with custom circle physics. Installable as a PWA, and progress is saved in localStorage.

## Tests

```bash
node tests/run.mjs
```

Covers:

- First drop and iPad input
- Merging, chain merges, and the top size not merging
- Physics: falling, settling, walls
- Game over at the danger line
- Saving and the high score
- Version and service worker cache staying in sync
- The PWA shell

## Versioning

`GAME_VERSION` in `js/config.js` is `MAJOR.MINOR.PATCH` with a three-digit patch. When you bump it, set `CACHE` in `sw.js` to `'drop-and-fuse-' + GAME_VERSION`.

The version shows in the corner, on the menu and on the game-over screen. Installed copies check the live `js/config.js` for a newer version and reload, but not in the middle of a game.
