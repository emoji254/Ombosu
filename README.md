# Nyaega

1:1 and semi-private coaching app. One file, `index.html`, is the whole app. `sw.js` is the service worker (works offline),
`manifest.webmanifest` and the icons make it installable.

## Changing the app
1. Edit `index.html` (or `sw.js`, the manifest, the icons).
2. Run `node tools/update-hashes.js`. It updates the security hash in `index.html` (without it the browser refuses the
   app's script and nothing starts) and the cache name in `sw.js` (without it installed phones never get the change).
3. Run the tests: see [tests/README.md](tests/README.md).

GitHub runs step 2 as a check (`--check`) and all the tests on every push (`.github/workflows/tests.yml`).

The three CDN libraries (PDF and Excel export) are pinned with integrity hashes kept in `lib-hashes.json`. To change a
version, update the `<script>` tag, its hash in `lib-hashes.json`, and the version in `tests/package.json`.
