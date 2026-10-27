# Nyaega tests

## Quick: paste into the browser console (nothing to install)
Open the app from localhost (for example, in the app folder run `python -m http.server 8000` and open
http://localhost:8000), open the browser console (F12), paste one of these files and press Enter. Each prints a
table of checks and removes everything it created (test ids start with `smk`). Use a profile you don't mind: they briefly
add a test client, program and sessions.

| File | What it checks |
|---|---|
| `smoke.js` | Start-up, start a session, log and save a set, history, export, conditioning (also as a pair), periodised weeks |
| `logger.js` | The set logger: sets and hints from the program, typing kg (per side on a bar) and reps, ✓ and the rest timer, how prescribed rest is read, supersets, warm-ups, delete + Undo, copy previous set, saving, "previous" and "best", editing a saved session |
| `movements.js` | The movement library: starter movements and variants, names with equipment, matching your own names ("DB RDL"), merging duplicates and relinking programs and history, bringing movements back from a safety copy |

## Everything at once, in a real browser
Needs [Node.js](https://nodejs.org). Once:

```
cd tests
npm install
npm run setup
```

Then each time:

```
npm test                  # all of them
node run.js phone a11y    # only some: smoke, logger, movements, phone, a11y
```

This uses a fresh browser profile every time, so your own data is never touched. Besides the three files above it runs:

- `phone.js`: phone checks. No sideways scrolling at 320 px and 412 px wide, also with the phone's text size at 130 %
  and 200 %. Swiping a set left deletes it, right copies the previous set, and a short swipe or an up/down drag does
  nothing. Every control in the logger can be tapped. Offline: the app is cached, starts with no network, and a new
  version waits for "Reload to update".
- `a11y.js`: accessibility. axe-core on every main screen, the logger, a dialog and the dark theme. Plus pinch-zoom,
  reduced motion, the page language and the screen-reader live region.

`PASS` / `FAIL` rows count; `NOTE` rows are things worth knowing that don't fail the run.
