# Fonts

The site serves its two typefaces itself, so it makes no request to another origin and the text does not move when a font
arrives (each page preloads both files).

| File | Typeface | Licence |
| --- | --- | --- |
| `bricolage-grotesque-latin.woff2` | Bricolage Grotesque (variable, weights 600 to 800) | SIL Open Font License 1.1, see `OFL-bricolage-grotesque.txt` |
| `source-serif-4-latin.woff2` | Source Serif 4 (variable, weights 400 to 600) | SIL Open Font License 1.1, see `OFL-source-serif-4.txt` |

Both are the Latin subset, downloaded on 2026-11-09 from the Google Fonts CSS API, which serves these two typefaces under
the same licences. To change them, replace the files and keep the `@font-face` rules at the top of `style.css`.
