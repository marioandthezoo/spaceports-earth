# spaceports.earth

Independent guide to Earth's spaceports — live departures, SpaceX launch sites,
the Starship flight log, Earth-to-Earth rocket routes on a live globe, and the
road to the Moon and Mars. Static site, no build step.

**Live:** https://spaceports.earth

Created by **Mario E. Delgado** — one of the biggest supporters and fans of
interplanetary travel and space exploration.

## Files

| Path | What it is |
|---|---|
| `index.html` | The page: markup + CSS, and the Content-Security-Policy meta tag |
| `app.js` | All scripts: live feeds, the Starship renderer, the E2E globe, the Beyond scenes |
| `img/` | Self-hosted NASA textures (Blue Marble, Black Marble, Moon, Mars) |
| `*.jpg` (root) | AI concept art used in the page |
| `CNAME` | GitHub Pages custom domain |

Upload `index.html` and `app.js` together — the page loads its script from
`app.js`, and the CSP blocks inline scripts.

## Security notes

- The CSP in `index.html` only allows scripts from this site, the pinned
  three.js file on cdnjs (also checked with a Subresource Integrity hash), and
  the one-line boot snippet in `<head>`, which is allowed by its SHA-256 hash —
  if you edit that snippet, recompute the hash in the CSP or it will be blocked.
  The page may only `fetch` the three public APIs it uses. If you add a
  service, add its origin to the matching directive or the browser blocks it.
- If `app.js` fails to load, the boot snippet un-hides the page after 4 s and
  the Earth ↔ Earth section falls back to the flat route map.
- Everything the live feeds return is HTML-escaped, and only absolute
  `http(s)` links/images from them are rendered.

## Manifest sign-ups

The "Get on the list" form validates input but is **not connected to a backend
yet** — it tells visitors the list opens soon and sends nothing. To go live,
pick a provider, add an adapter in `app.js` (the `SIGNUP` / `ADAPTERS` block in
the "manifest signup" section), and add the provider's origin to the CSP
`connect-src`. The form never submits natively (`form-action 'none'`, and the
button stays disabled until `app.js` runs), so a visitor's email can't end up
in a URL.

Launch data: Launch Library 2 (The Space Devs) · News: Spaceflight News API ·
Imagery: NASA public-domain library. Independent site — not affiliated with
SpaceX or NASA. Nothing here is investment advice.
