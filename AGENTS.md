# AGENTS.md

## Architecture

- **App**: browser-only WebHID calibration tool for Sony PlayStation controllers (DS4 v1/v2, DS5, DS5 Edge, VR2 L/R)
- **Stack**: vanilla JS (ES modules), Bootstrap 5.3.3 + jQuery 3.7.1 (CDN), Gulp 5, Rollup
- **Entry**: `js/core.js` is the ESM entrypoint; Rollup bundles to single `app.js`
- **No test suite, linter, formatter, or typechecker** is configured anywhere

## Dev commands

```bash
npm run build           # dev build (source maps, no minification)
npm run build:prod      # production build (minified, hashed, assets inlined)
npm run clean           # delete dist/ and .tmp/
npm run dev:full        # RECOMMENDED: build + watch + HTTPS dev server
npm run start           # build + HTTPS serve (single build, no watch)
npm run serve:https     # HTTPS serve only (WebHID requires HTTPS)
```

**WebHID requires HTTPS** — never use plain `npm run serve` for controller work, only `serve:https` or `dev:full`.

## Build pipeline (Gulp)

1. Clean → parallel JS (Rollup) + CSS (concat) → bundle assets → parallel HTML + templates + lang + static assets
2. **Dev vs prod difference is critical**: production bundles all templates and SVGs into `window.BUNDLED_ASSETS` as an inline `<script>` in `index.html`; dev fetches them from `templates/` and `assets/` at runtime via `template-loader.js`. If you change a template, test dev mode AND prod mode.
3. Terser mangle config in `gulpfile.js` has a `reserved` list of function names exposed to `window` for `onclick` HTML handlers. If you add a new global function used in an HTML `onclick`, add its name to that list.

## Testing / validation

- **Only automated check**: `python3 scripts/check_translations.py` — verifies translation coverage. Exits 1 on mismatches.
- Entries outside js/templates dirs considered as default en_us translations
- Translation keys are the **English text itself** (not symbolic), e.g. `"Connect": "Conectar"`
- To add new hardcoded text, update `check_translations.py`'s `WHITELIST_UNUSED` set.

## HTTPS / certs

- Self-signed certs: `server.crt` + `server.key` in project root
- Regenerate: `openssl req -x509 -newkey rsa:4096 -keyout server.key -out server.crt -days 365 -nodes -subj "/CN=localhost"`
- Browsers show a cert warning — this is expected for local dev

## Browser support

- Only Chrome / Edge support WebHID. Firefox and Safari do not.

## Controller detection

- Vendor 0x054c (Sony). Product IDs: 0x05c4 (DS4 v1), 0x09cc (DS4 v2), 0x0ce6 (DS5), 0x0df2 (DS5 Edge), 0x0e45 (VR2 L), 0x0e46 (VR2 R)
- `ControllerFactory.getUIConfig()` enables/disables UI sections per controller model

## Conventions

- All JS files open with `'use strict'` (legacy, predates `"type": "module"`)
- Globals exposed to `window.*` for HTML `onclick` handlers — this is intentional
- jQuery is used via the global `$` everywhere
- Analytics calls go to `https://the.al/ds4_a/l` via jQuery AJAX; don't break or remove the `la()` function
