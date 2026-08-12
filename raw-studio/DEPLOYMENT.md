# Deployment

RAW Studio is a static site. It only needs to be **built** and its `dist/`
served — GitHub Pages does the serving; it never builds. There are two supported
setups.

## A) Standalone repository (recommended)

1. Push the project to a GitHub repo.
2. Repository **Settings → Pages → Source → GitHub Actions**.
3. Push to `main`. `.github/workflows/deploy.yml` runs typecheck + lint + tests,
   builds, and deploys. The site appears at
   `https://<user>.github.io/<repo>/`.

The workflow sets `VITE_BASE=/<repo>/` automatically, copies `index.html` to
`404.html` (SPA fallback), and adds `.nojekyll`. Nothing to edit.

## B) Swallow subfolder (many projects in one repo)

Put the project in a subfolder (e.g. `swallow-repo/raw-studio/`) and use the
Swallow build workflow, which builds every subfolder that has a `package.json`
and serves the result under `/<repo>/raw-studio/`, alongside a generated index.
The base path is set to `/<repo>/raw-studio/` at build time, so assets resolve
correctly.

Commit a `package-lock.json` in the subfolder for reproducible `npm ci` and
faster CI.

## Production checklist

- [ ] **Pages source is "GitHub Actions"** (not "Deploy from a branch" pointed at
      source — that would serve unbuilt files and show a blank page).
- [ ] **Base path** matches the deploy URL (`VITE_BASE`; handled by CI).
- [ ] **`.nojekyll`** is present in the artifact (handled by CI) so underscore
      folders like `ort/` are served.
- [ ] **COI service worker** loads first in `index.html` — check the console
      shows `crossOriginIsolated === true` on the deployed site.
- [ ] **ONNX assets**: `dist/ort/*.wasm` exist after build; the AI tab loads a
      model without a 404. The wasm path is `<base>/ort/` (set in the worker).
- [ ] **SPA fallback**: reloads on the site root work (there is no deep client
      routing; if you add a router, use a hash router on Pages).
- [ ] **Caching**: hashed asset filenames make cache-busting automatic; the COI
      service worker updates itself on new deploys.

## Local production test

```bash
npm run build
npm run preview   # serves dist/ at http://localhost:4173
```

Open the preview URL, load a photo, make an edit, and export to confirm the full
pipeline before deploying.
