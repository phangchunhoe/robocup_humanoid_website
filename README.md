# StrikerChase Curve Artifacts

A small React (Vite) app bundling the two `StrikerChase` curve artifacts as pages:

- **Bézier Chase-Path — Anatomy & Activation** (`/#/anatomy`) — static diagram walkthrough.
- **Long-Range Curve Preview — StrikerChase** (`/#/long-range-preview`) — interactive, draggable preview.

Both pages are reproduced verbatim from the original artifacts (same markup, CSS, and logic), just wrapped in React components so they can be built and deployed as a normal static site.

## Content files (`src/content/`)

Editable data that isn't code — lists and text shown on a page, but not the
layout or logic around them — lives in `src/content/` so it can be updated
without touching component code. Each file's own top-of-file comment repeats
this, but for a full picture in one place:

| File | Controls | Used by |
|---|---|---|
| `homeLinks.js` | "Quick Links & Resources" list on the Home page (`/#/`). Each entry is `{ href, title }`. | `src/pages/Home.jsx` |
| `strikerStrategyItems.js` | Cards on the Striker Strategy category page. | `src/App.jsx` |
| `freekickStrategyItems.js` | Cards on the Freekick Strategy category page. | `src/App.jsx` |
| `goalieStrategyItems.js` | Cards on the Goalie Strategy category page. | `src/App.jsx` |
| `areasForImprovement.js` | Grouped bullet list in the "Areas for Improvement" popup. | `src/components/ImprovementModal.jsx` |
| `teamCommSpecText.js` | Verbatim teammate-communication byte-format spec text, copied byte-for-byte so the page's copy button always hands out the authoritative version. | `src/pages/TeamCommByteFormat.jsx` |
| `testDefinitions.js` | Card list in the Testing tab. | `src/pages/RobotSimulator.jsx`, `src/components/TestCard.jsx` |
| `physicsSliders.js` | Label/range/unit metadata for the run step's physics-drawer sliders, shared with the Approach & Kick Time PDF report so both read one source of truth. | `src/pages/RobotSimulator.jsx`, `src/components/ApproachKickTestFlow.jsx`, `src/components/CompareResultsFlow.jsx`, `src/lib/pdf/approachKickReport.js` |
| `simulatorPasteGuide.js` | Simulator editor step's per-tab paste instructions, placeholders, intro copy, and expected file paths. | `src/pages/RobotSimulator.jsx` |

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
