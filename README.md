# RoboCup Humanoid — Strategy Docs &amp; Robot Simulator

A React (Vite) single-page site documenting this team's RoboCup Humanoid
League strategy code (`brain_tree.cpp`) and letting you run it live. It
combines write-ups of the striker, goalkeeper, and set-piece logic with
interactive explorers that recompute decisions straight from the real C++,
a full robot simulator that interprets a pasted `brain_tree.cpp`, and a
cheat sheet of the commands used to actually run the robot.

Routing uses `HashRouter`, so every page below is reachable at
`.../#<path>` (e.g. `.../#/anatomy`).

## Pages (`src/pages/`)

| Path | Page | What it's for |
|---|---|---|
| `/` | `Home.jsx` | Landing page: a "Run Simulation" shortcut, the Quick Links & Resources list, and the Handy Commands cheat sheet. |
| `/striker-strategy` | `CategoryPage.jsx` | Cards linking to the striker-related artifacts: Bézier Chase-Path Anatomy and the Long-Range Curve Preview. |
| `/goalie-strategy` | `CategoryPage.jsx` | Card linking to the Goalkeeper Positioning Explorer. |
| `/freekick-strategy` | `CategoryPage.jsx` | Card linking to the Set-Piece Position Explorer. |
| `/anatomy` | `BezierAnatomy.jsx` | Static diagram walkthrough of how `StrikerChase` curves in behind the ball, when it skips the curve and drives straight instead, and what each of the four Bézier control points does. |
| `/long-range-preview` | `LongRangePreview.jsx` | Interactive, draggable preview of the proposed exponential-decay long-range approach curve, with live gating-threshold sliders. |
| `/freekick-explorer` | `FreekickExplorer.jsx` | Interactive field for all 5 set pieces (direct/indirect free kick, throw-in, goal kick, corner kick) — toggle attacking vs. defending and drag the ball to see the lead striker, assist striker, and goalkeeper target positions recompute live, straight from `brain_tree.cpp`. |
| `/goalie-explorer` | `GoalieExplorer.jsx` | Interactive field — drag the ball anywhere to see the goalkeeper's retreat, chase, adjust, and kick decisions recompute live, straight from `GoalieDecide` in `brain_tree.cpp`, including the penalty-area and danger-zone thresholds. |
| `/team-comm-byte-format` | `TeamCommByteFormat.jsx` | The fixed 16-byte UDP packet spec robots broadcast to coordinate roles, ball belief, and the goalkeeper handoff. |
| `/robot-simulator` | `RobotSimulator.jsx` | Paste a `brain_tree.cpp`: it's parsed and interpreted so you can watch one robot chase, adjust, and kick a real ball in real time, run comparison/regression tests, and export an approach-and-kick-time PDF report. |

Every page also has a global **artifacts drawer** (top-right panel icon in
`Header.jsx`) linking directly to all of the above, and an **Areas for
Improvement** popup summarizing known gaps.

## Content files (`src/content/`)

Editable data that isn't code — lists and text shown on a page, but not the
layout or logic around them — lives in `src/content/` so it can be updated
without touching component code. Each file's own top-of-file comment repeats
this, but for a full picture in one place:

| File | Controls | Used by |
|---|---|---|
| `homeLinks.js` | "Quick Links & Resources" list on the Home page (`/#/`). Each entry is `{ href, title }`. | `src/pages/Home.jsx` |
| `handyCommands.js` | "Handy Commands" cheat sheet on the Home page — sections of copy-pastable terminal commands (game controller, robot SSH/start scripts, Wi-Fi, whitelisting an IP). A group can also carry a `snippet` — a collapsible file excerpt showing exactly which line to change. | `src/pages/Home.jsx` |
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
