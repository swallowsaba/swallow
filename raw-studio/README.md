# RAW Studio

A fully client-side, open-source RAW photo developer that runs entirely in the
browser and deploys to **GitHub Pages** — no server, no API, no database.

> **Status:** Phase 1 (project scaffold). This is the foundation the rest of the
> app is built on. See the roadmap below.

## Quick start

```bash
git clone <your-fork-url>
cd raw-studio
npm install
npm run dev
```

Open the printed URL. The landing page runs a capability check that confirms your
browser supports the pipeline (WASM threads, WebGPU/WebGL2, IndexedDB, etc.).

## Build & deploy

```bash
npm run build     # type-check + production build into dist/
npm run preview   # serve the production build locally
```

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds and
publishes to GitHub Pages. Enable **Settings → Pages → Source: GitHub Actions**
once, and the base path is derived from your repo name automatically.

## Why the service worker?

GitHub Pages cannot send custom HTTP headers, but multi-threaded WebAssembly and
`SharedArrayBuffer` (used by OpenCV.js threads and ONNX Runtime Web) require
`Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy`. `public/coi-serviceworker.js`
re-adds those headers on the client so `crossOriginIsolated === true`. During
`npm run dev` the Vite server sets the headers directly, so the worker is only
needed for the deployed site.

## Tech stack

React 19 · Vite · TypeScript (strict) · Tailwind CSS · shadcn/ui · Zustand ·
React Hook Form · OpenCV.js (WASM) · Web Workers + Comlink · WebGPU/WebGL ·
ONNX Runtime Web · IndexedDB (Dexie) · ExifReader.

## Roadmap

1. **Project scaffold** ← you are here
2. Directory architecture (feature-first)
3. Shared UI components (shadcn)
4. Editor layout (Lightroom-style panels)
5. Image viewer (zoom / pan / before-after)
6. RAW decode (LibRaw WASM)
7. Adjustments pipeline (GPU)
8. Presets
9. History / non-destructive edits
10. AI (ONNX Runtime Web)
11. Export
12. Performance
13. Tests
14. GitHub Pages release

## License

MIT — see [LICENSE](./LICENSE).
