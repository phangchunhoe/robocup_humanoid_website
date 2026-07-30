# StrikerChase Curve Artifacts

A small React (Vite) app bundling the two `StrikerChase` curve artifacts as pages:

- **Bézier Chase-Path — Anatomy & Activation** (`/#/anatomy`) — static diagram walkthrough.
- **Long-Range Curve Preview — StrikerChase** (`/#/long-range-preview`) — interactive, draggable preview.

Both pages are reproduced verbatim from the original artifacts (same markup, CSS, and logic), just wrapped in React components so they can be built and deployed as a normal static site.

## Develop

```bash
npm install
npm run dev
```

## Deploy to GitHub Pages

**Option A — GitHub Actions (recommended):** push this folder to a GitHub repo on branch `main`. The included workflow (`.github/workflows/deploy.yml`) builds and deploys automatically. In the repo's Settings → Pages, set the source to "GitHub Actions".

**Option B — manual:**

```bash
npm install
npm run deploy
```

This uses the `gh-pages` package to publish the `dist/` build to the `gh-pages` branch. Then enable Pages for that branch in the repo settings.

The Vite `base` is set to `./` (relative), so it works at any GitHub Pages project path without extra configuration. Routing uses `HashRouter`, so direct links like `.../#/anatomy` work without server-side rewrite rules.
