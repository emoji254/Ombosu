# Nyaega source

`Nyaega-working.html` (one file you can open directly) is **generated** from the parts in this folder. Edit the parts, then build.

```
powershell -ExecutionPolicy Bypass -File build-app.ps1     # src\ -> Nyaega-working.html
powershell -ExecutionPolicy Bypass -File build-site.ps1    # does the step above, then builds site\ (CSP hash, service worker)
```

Each build joins the files **in this order, with nothing added or changed**: `head.html`, `styles.css`, `body.html`,
`js\NN-*.js` in number order, `tail.html`. The JavaScript files are pieces of ONE script that share one scope, not ES
modules: there are no imports or exports. A file may use anything from an earlier file at load time, and anything at all
once the app is running (functions are hoisted; `const`/`class` are only usable after the line that defines them has run).
So: keep the numbers in order, and don't put code that runs at load time before the thing it needs.

| Files | What is in them |
|---|---|
| `01-storage` | Local storage, IndexedDB, data-file mode, the `Store` facade |
| `02-state-helpers` | App state `S`, helpers, derived indexes, attendance and scheduling |
| `03-ui-core` | Save-error banner, program autosave, dialogs, toasts, exercise helpers |
| `04-migrations`, `05-backups` | Schema versions; persistent storage and daily snapshots |
| `06-sync` | Account and sync (Supabase): sign-in, outbox, push/pull, conflicts |
| `07-privacy` | Consent, data rights, retention, privacy notice |
| `08-devices-audit`, `09-team` | Devices (with device keys), audit log, assistant coaches |
| `10-lock`, `11-oauth` | Sign-in and app lock screen; Google/Apple sign-in |
| `12-sync-hardening` ... `16-group-conditioning` | Later additions that extend earlier objects: signed-out queueing and tombstones, rest alerts, per-record exercise sync, periodisation, group-conditioning helpers |
| `17-boot` | Start-up (`boot()`) and the load-failure screen |
| `18-routing`, `19-sessions`, `20-cues-timerbar`, `21-render` | Tabs and routes, parallel sessions and recovery, sound cues and the timer bar, `render()` |
| `22-` ... `31-` | The screens: Today (logger), Calendar, Clients, Pairings, Programs, Conditioning, Exercises, History, Data; PDF and Excel exports |
| `32-safe-input` ... `35-import` | Input validation, encrypted backup, installable-app code, import |
| `36-wire` | `wire()`: every click and input handler, attached after each render |
| `37-late-dialogs` | The pairing dialog and the theme restore |
| `38-mobile-nav` | Phone/tablet bottom bar, the "+" quick-action button and its pickers (the last file) |

`17-boot.js` runs in the middle of the load: it starts `boot()` before the files after it have loaded. That is how the app
always worked (boot waits on storage before it touches anything defined later), so don't move it.

## Checks
- `build-app.ps1 -Check` says whether `Nyaega-working.html` still matches `src\`.
- `build-app.ps1` refuses to overwrite a `Nyaega-working.html` that was edited by hand since the last build.
- `tests\smoke.js` is a quick end-to-end check you paste into the browser console (see the top of that file).
