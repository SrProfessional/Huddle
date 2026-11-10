# Vendored scripts

The home page motion (Issue #61) uses three scripts, copied here so the site loads nothing from another origin.
There is no build step and no npm dependency: these are the minified files from the npm packages, unchanged.

| File | Package | Pinned version | Published | Licence |
| --- | --- | --- | --- | --- |
| `gsap.min.js` | `gsap` | 3.15.0 | 2026-04-13 | GSAP Standard "no charge" license, see `LICENSE-gsap.txt` |
| `ScrollTrigger.min.js` | `gsap` | 3.15.0 | 2026-04-13 | same |
| `lenis.min.js` | `lenis` | 1.3.27 | 2026-10-15 | MIT, see `LICENSE-lenis.txt` |

Versions were chosen to be at least two weeks old on 2026-11-09. GSAP 3.15.1 (2026-11-04) was left out for that reason.

## GSAP licence, in short

GSAP is free for this use (a public, open-source project website). The terms are at <https://gsap.com/standard-license>,
checked on 2026-11-09. Keep the licence notice at the top of each file, and re-read the terms before changing how the site is used.

## How to update

1. Pick a version published at least two weeks ago.
2. `npm pack gsap@<version> lenis@<version>` in a scratch folder, outside the repo.
3. Copy `dist/gsap.min.js`, `dist/ScrollTrigger.min.js` and `dist/lenis.min.js` here, and update the table above.
4. `node --test test/site/` checks the files, their licences and the pinned versions.
