# Architecture

Plain HTML, CSS and canvas with no build step. The scripts are plain `<script>` tags that share global scope, loaded in this order from `index.html`.

## Files

| File | Contents |
|------|----------|
| `js/config.js` | `GAME_VERSION` and tuning constants: stage size, bin size, danger line, gravity, orb sizes |
| `js/save.js` | High score and stats in localStorage |
| `js/audio.js` | Sound effects |
| `js/physics.js` | Circle physics: integration, walls, collisions between orbs, finding merges, sleeping |
| `js/particles.js` | Bursts and pops |
| `js/render.js` | Fitting the 390×700 stage to the screen, and drawing the bin, orbs, HUD and drop guide |
| `js/input.js` | Turning pointer positions into a drop column, and deciding when a release drops |
| `js/game.js` | Game state (`menu`, `play`, `over`): dropping, merging, the danger line, game over |
| `js/main.js` | Screens, the frame loop, pointer handlers, service worker registration |
| `sw.js`, `manifest.webmanifest` | Offline cache and PWA install |
| `tests/run.mjs` | Test runner |

## Updates

`js/main.js` registers `sw.js` and checks for updates two ways:

- It calls `registration.update()` on load, when the tab regains focus, and every minute. A new service worker takes over as soon as it installs.
- Every two minutes, and whenever the tab becomes visible, it fetches `js/config.js` with caching disabled and compares `GAME_VERSION`.

Either way, the page reloads to pick up the new version, but not in the middle of a game. A pending reload happens at the next menu or game-over screen.
