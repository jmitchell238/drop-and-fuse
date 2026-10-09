# Development

## Running locally

```bash
python3 -m http.server 8080
```

Then open http://localhost:8080.

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

`GAME_VERSION` in `js/config.js` is `MAJOR.MINOR.PATCH` with a three-digit patch. When you bump it, set `CACHE` in `sw.js` to `'drop-and-fuse-' + GAME_VERSION`. The version shows in the corner, on the menu and on the game-over screen.
