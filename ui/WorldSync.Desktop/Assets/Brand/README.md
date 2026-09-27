# Official WorldSync icon

Source: Open Design project 7818f69c-a4bd-4344-8620-945f5a9a8eca/index.html.
The SVGs reproduce the prototype download handler exactly (including its defs).
`master.svg` is the dark variant; `light.svg` is the light variant; `app.svg`
is the official square export (same dark artwork plus its original rounded rect).
No duplicate dark SVG is necessary. The app export, not the CSS preview tile,
is used for Windows. All path/circle attributes match the displayed symbols;
the prototype export only calls its gradient `g` instead of `ws-gradient`.

provenance.json records the canonical HTML hash and exact exported SVG hashes.
PNG: 1024 x 1024, transparent corners. ICO: nine PNG-compressed RGBA frames,
16/20/24/32/40/48/64/128/256. Rasterization uses sharp at build time only:
`node ui/generate-icon.cjs <existing-sharp-module-path>`.
No runtime dependency or source vector changes are introduced.

Windows shortcuts use WorldSync.exe,0, not an external temporary ICO.
Explorer can cache icons; validate PE resources before clearing any cache.
