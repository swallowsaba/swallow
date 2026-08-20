# RAW Studio

A fully client-side, open-source RAW photo developer that runs entirely in the
browser and deploys to **GitHub Pages** — no server, no API, no database, no
build step for the end user.

> `git clone` → `npm install` → `npm run dev` to develop.
> `git push` → GitHub Actions builds and publishes to Pages. That's it.

![screenshot placeholder — add docs/screenshot.png](docs/screenshot.png)

## Features

- **Open** JPEG, PNG, WebP, AVIF, and RAW — CR2, CR3, ARW, NEF, RAF, RW2, ORF,
  PEF, DNG — decoded in a Web Worker (LibRaw via WebAssembly).
- **View** with WebGL2: fit/fill, 25–400 % zoom, pan, rotate, before/after.
- **Develop** on the GPU: exposure, contrast, highlights/shadows, whites/blacks,
  brightness, temperature/tint, saturation, vibrance, gamma — live preview.
- **Local masks**: brush, radial, and graduated masks, each carrying its own
  light/color/clarity adjustments, composited on the GPU by per-pixel coverage —
  the piece Lightroom-class local editing needs.
- **Auto** corrections (exposure, white balance, contrast, color) from image
  analysis, plus in-browser ONNX models (subject/background segmentation).
- **Presets**: ten built-ins, plus create/rename/duplicate/delete, favorites,
  search, and JSON import/export.
- **Look Mixer**: blend continuously across the whole develop between two looks
  (a slider) or four (a 2D pad) — snapshots, presets, the current edit, or a
  neutral reset — then apply the mix you like. Only possible because an entire
  develop is a serializable bag of numbers.
- **Text, stickers, frames & privacy**: add text (font, color, outline,
  shadow, rotation), emoji stickers, border/matte frames, and privacy regions
  (mosaic/blur/block to redact faces or plates); drag to position, all baked
  into the exported image.
- **Liquify**: push/bloat/pinch to reshape by hand (bigger eyes, slimmer
  jawline); undoable, and baked into the export.
- **Face reshape**: detect the subject and auto-enlarge eyes / slim the jaw
  with two sliders, then drag the eye/jaw handles to fine-tune. Uses a real
  facial-landmark model when one is registered, else a proportion estimate.
- **Non-destructive**: full undo/redo timeline with jump-to-step and snapshots.- **Persistent**: presets, per-image edits, and settings are saved to IndexedDB
  and restored on reload — all locally, nothing leaves your device.
- **Export** to JPEG/PNG/WebP/AVIF with quality, resize, filename templates, and
  a watermark.

## Quick start

```bash
git clone <your-fork-url>
cd raw-studio
npm install
npm run dev
```

```bash
npm run build        # type-check + production build to dist/
npm run preview      # serve the build locally
npm run test         # unit tests (Vitest)
npm run e2e          # end-to-end smoke tests (Playwright)
npm run lint         # ESLint (no-explicit-any enforced)
npm run typecheck    # tsc, strict
```

## Deploy to GitHub Pages

**Enable once:** repository **Settings → Pages → Source → GitHub Actions**.
Then every push to `main` builds and deploys via `.github/workflows/deploy.yml`.
The base path is derived from the repository name automatically — no edits
needed. See [DEPLOYMENT.md](./DEPLOYMENT.md) for the full checklist and for the
Swallow multi-project (subfolder) setup.

## Why the extra plumbing?

GitHub Pages serves static files and can't set HTTP headers, which creates two
well-known constraints this project already solves:

- **Cross-origin isolation** (needed for `SharedArrayBuffer` / multi-threaded
  WASM): re-added on the client by `public/coi-serviceworker.js`.
- **ONNX Runtime wasm assets**: copied into `dist/ort/` at build time and loaded
  from the base path (see `vite.config.ts` and `inference.worker.ts`).

## Architecture

Feature-first. Shared domain types live in `src/types`; each feature under
`src/features/<name>` exposes a public API through its `index.ts`.

```
src/
├─ app/            app shell + layout (toolbar, panels, editor layout)
├─ components/ui/  hand-written shadcn/ui primitives (no CLI)
├─ features/
│  ├─ adjustments/ color pipeline (shader-mirrored, tested) + panels
│  ├─ ai/          auto corrections + ONNX inference (worker, registry, cache)
│  ├─ editor/      edit store, history wiring, live-preview overlay
│  ├─ export/      full-res render + encode + watermark
│  ├─ history/     undo/redo/snapshots + timeline UI
│  ├─ library/     RAW decode worker, format detection, thumbnails, grid
│  ├─ look-mixer/  continuous blend across full develops (snapshots/presets)
│  ├─ masks/       local-adjustment masks: alpha math, ops, overlay, panel
│  ├─ overlays/    text + emoji stickers + frames: layout/geometry, export bake
│  ├─ liquify/     manual warp + auto face reshape: warp math, GL pass, panels
│  ├─ perf/        LRU cache, rAF coalescer, concurrency limiter, virtualization
│  ├─ persistence/ Dexie/IndexedDB repository + migrations
│  ├─ presets/     built-ins, apply, JSON IO, store
│  └─ viewer/      WebGL renderer, viewport math, canvas, controls
├─ hooks/  stores/  types/  utils/  lib/
```

A guiding rule: fallible logic (color math, format detection, history, resize,
migrations, tensor pre/post) is pure and unit-tested; the GPU shader mirrors the
tested CPU pipeline line-for-line.

## Tech stack

React 19 · Vite · TypeScript (strict) · Tailwind CSS · shadcn/ui · Zustand ·
React Hook Form · WebGL2 · Web Workers + Comlink · WebGPU/WASM ·
ONNX Runtime Web · LibRaw (WASM) · Dexie (IndexedDB) · Vitest · Playwright.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). The golden rule: everything must keep
working browser-only on GitHub Pages, and `typecheck` + `lint` + `test` must be
green.

## License

MIT — see [LICENSE](./LICENSE). Note: the bundled RAW decoder (LibRaw) is
LGPL-2.1/CDDL, and ONNX models carry their own licenses (listed in the model
registry).
