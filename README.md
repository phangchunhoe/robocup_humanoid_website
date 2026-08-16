# RoboCup Humanoid — Strategy Docs &amp; Robot Simulator

A React (Vite) single-page site documenting this team's RoboCup Humanoid
League strategy code (`brain_tree.cpp`) and letting you run it live. It
combines write-ups of the striker, goalkeeper, and set-piece logic with
interactive explorers that recompute decisions straight from the real C++,
a full robot simulator that interprets a pasted `brain_tree.cpp`, and a
cheat sheet of the commands used to actually run the robot.

Routing uses `HashRouter`, so every page below is reachable at
`.../#<path>` (e.g. `.../#/anatomy`).

## Tech stack

- **React 18 + Vite 5** for the single-page app.
- **React Router v6** with `HashRouter`, which keeps GitHub Pages routing simple.
- **Plain CSS** colocated by page/component, with shared design tokens in
  `src/styles/tokens.css`.
- **Framer Motion** for magnetic liquid-glass controls, spring clicks, drawers,
  and simulator motion.
- **Lucide React** for interface icons.
- **KaTeX** for formula rendering in Simulation Math.
- **jsPDF** for the approach-and-kick PDF report.
- **Self-hosted fonts** from `@fontsource`: Space Grotesk for UI/prose and
  JetBrains Mono for technical values.
- **gh-pages / GitHub Actions** for deployment.

There is no UI framework, Tailwind, Sass, CSS-in-JS layer, or TypeScript setup in
this project.

## Design system

The current target visual language is a dark technical HUD with a liquid-glass
theme. The best reference implementations are the Robot Simulator,
Simulation Math, `GlassButton`, `GlassSlider`, `GlassModal`, `ArtifactsDrawer`,
`SegmentedControl`, `RoleToggle`, and `SelectableCard`.

Design rules for future edits:

- Use `src/styles/tokens.css` for shared color, type, spacing, radius, shadow,
  blur, and motion values.
- Use **Space Grotesk** for normal language: headings, prose, nav, buttons,
  labels, cards, tabs, and controls.
- Use **JetBrains Mono** only for technical values: commands, paths, byte
  values, logs, coordinates, counters, formula symbols, and live HUD readouts.
- Keep the palette centered on charcoal surfaces, warm off-white text, muted
  secondary text, and one emerald interactive accent.
- Prefer liquid-glass chrome for controls, modals, drawers, and HUD surfaces
  floating over the simulator, field diagrams, math visualizations, or dense
  technical panels.
- Use ordinary elevated panels for static content and repeated cards; avoid
  nested glass filters.
- Keep interactive targets at least 44px, use hairline borders instead of heavy
  shadows, and avoid decorative gradients or extra accent colors.

See `CLAUDE.md` for the full editing and design brief, including migration notes
for older pages that still use legacy CSS.

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
| `/simulation-math` | `SimulationMath.jsx` | Every formula behind the robot simulator's physics engine, vision model, curve math, and test harness, with a sticky table of contents, a variable-meaning table per formula, and an interactive or animated visualization for each — see [Simulation math](#simulation-math-srclibsim) below, which this page renders. |

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
| `simulationMathToc.js` | Table-of-contents structure (section/formula ids and labels) for the Simulation Math page's sticky sidebar nav. Section component `FormulaBlock` ids must match these ids or the nav and scroll-spy silently stop matching up. | `src/pages/SimulationMath.jsx` |

## Simulation math (`src/lib/sim/`)

Everything below is math implemented in this repo's own JS — as opposed to
the pasted `brain_tree.cpp`, which is arbitrary and only interpreted. Field
coordinates are metres/radians, origin at the centre circle, $+x$ toward the
opponent goal, $+y$ left, $\theta$ CCW-positive — matching the C++ exactly.

Each formula below is followed by a **Variables** table and a short
**Plain-English** note. The table defines every symbol. The note explains
what the formula does.

This same content also has a live, in-app counterpart: **`/simulation-math`**
(`src/pages/SimulationMath.jsx`) renders every formula below as its own
`FormulaBlock` — equation, variable table, point-form explanation, and an
interactive or animated visualization built from this repo's own math
(dragging a point calls the real `curves.js`/`physics.js`/`host.js`
functions, not a re-derived copy). See that page's own components under
`src/components/simmath/` for the visualization source.

### Physics engine — `physics.js`

**Deterministic PRNG (mulberry32).** Seeded so a run is exactly reproducible:

$$
\begin{aligned}
a &\leftarrow (a + \mathtt{0x6D2B79F5}) \bmod 2^{32} \\
t &\leftarrow \big(a \oplus (a \ggg 15)\big) \cdot (a \mid 1) \bmod 2^{32} \\
t &\leftarrow \Big(t + \big(t \oplus (t \ggg 7)\big)\cdot(t \mid 61)\Big) \oplus t \bmod 2^{32} \\
\text{next}() &= \frac{\big(t \oplus (t \ggg 14)\big) \bmod 2^{32}}{2^{32}}
\end{aligned}
$$

| Symbol | Meaning |
|---|---|
| $a$ | Generator's internal 32-bit state. Seeded once per run (the "Seed" field), overwritten every call. |
| $t$ | Scratch value used partway through mixing the state. |
| $\oplus$ | Bitwise XOR. |
| $\ggg$ | Unsigned right bit-shift. |
| $\mathtt{0x6D2B79F5}$ | Fixed constant that spreads the state out. |
| $\text{next}()$ | The returned number, scaled into the range $[0,1)$. |

**Plain-English:** This scrambles a starting number into a new "random"
number every time it's called. The same starting seed always produces the
same sequence. That's what makes a run repeatable.

**Gaussian noise (Box–Muller)**, from two uniforms $u,v$ drawn off that stream:

$$
z = \sqrt{-2\ln u}\,\cos(2\pi v)
$$

| Symbol | Meaning |
|---|---|
| $u, v$ | Two independent random numbers between 0 and 1, both drawn from the PRNG above. |
| $z$ | The resulting bell-curve (Gaussian) random number, centred on 0. |

**Plain-English:** This turns two plain random numbers into one
bell-curve-shaped random number. Small errors are common. Big errors are
rare. That's more realistic than a flat random spread, so it's used for kick
scatter and vision noise.

**Commanded-speed cap.** If $\lVert(v_x,v_y)\rVert$ exceeds the walk-speed limit $v_{\max}$, both components are rescaled:

$$
(v_x, v_y) \leftarrow \frac{v_{\max}}{\sqrt{v_x^2+v_y^2}}\,(v_x, v_y) \quad \text{if } \sqrt{v_x^2+v_y^2} > v_{\max}
$$

| Symbol | Meaning |
|---|---|
| $v_x, v_y$ | Robot's commanded forward/sideways speed, in the robot's own frame (m/s). |
| $v_{\max}$ | Configured maximum walk speed (the `maxWalkSpeed` physics constant). |

**Plain-English:** Add up the sideways and forward speed into one overall
speed. If that's faster than the robot's top speed, shrink both parts by the
same ratio. The direction stays the same. Only the speed comes down.

**Bounded-acceleration rate limiting**, applied independently to $v_x,v_y,\dot\theta$ toward each tick's commanded value:

$$
v \leftarrow \operatorname{clamp}\big(v_{\text{target}},\; v-a_{\max}\,dt,\; v+a_{\max}\,dt\big)
$$

| Symbol | Meaning |
|---|---|
| $v$ | Whichever velocity component is being updated this tick ($v_x$, $v_y$, or the angular speed $\dot\theta$). |
| $v_{\text{target}}$ | That same component's commanded value for this tick. |
| $a_{\max}$ | Matching acceleration limit (`maxAccel` for $v_x,v_y$, `maxAngAccel` for $\dot\theta$). |
| $dt$ | Simulation's fixed time step, $0.01\,\text{s}$. |

**Plain-English:** The robot can't jump straight to a new speed. Each tick,
its current speed can only move a small step closer to the target speed.
The size of that step is limited by the robot's maximum acceleration.

**Robot-frame → field-frame integration** (holonomic base, Euler step):

$$
\begin{aligned}
x &\leftarrow x + (v_x\cos\theta - v_y\sin\theta)\,dt \\
y &\leftarrow y + (v_x\sin\theta + v_y\cos\theta)\,dt \\
\theta &\leftarrow \operatorname{atan2}\!\big(\sin(\theta+\dot\theta\,dt),\ \cos(\theta+\dot\theta\,dt)\big)
\end{aligned}
$$

| Symbol | Meaning |
|---|---|
| $x, y$ | Robot's position on the field (metres). |
| $\theta$ | Robot's heading (radians, 0 = facing $+x$). |
| $v_x, v_y$ | Robot's own (already rate-limited) forward/sideways speed. |
| $\dot\theta$ | Robot's angular speed. |
| $dt$ | Fixed time step. |

**Plain-English:** The robot's speed is measured relative to the way it's
facing, not relative to the field. This rotates that speed into field
directions. Then it nudges the robot's position forward by that speed times
one tiny time step.

**Ball rolling resistance** — constant deceleration $a_{\text{ball}}$ until it drops below a stop threshold $v_{\text{stop}}$, direction preserved:

$$
\lVert v_{\text{ball}}\rVert \leftarrow \max\!\big(0,\ \lVert v_{\text{ball}}\rVert - a_{\text{ball}}\,dt\big),\qquad
v_{\text{ball}} \leftarrow
\begin{cases}
0 & \lVert v_{\text{ball}}\rVert < v_{\text{stop}} \\[2pt]
\dfrac{v_{\text{ball}}}{\lVert v_{\text{ball}}\rVert_{\text{old}}}\,\lVert v_{\text{ball}}\rVert & \text{otherwise}
\end{cases}
$$

| Symbol | Meaning |
|---|---|
| $v_{\text{ball}}$ | Ball's velocity vector. |
| $\lVert v_{\text{ball}}\rVert$ | Ball's speed (magnitude). |
| $a_{\text{ball}}$ | Fixed rolling deceleration (`ballDecel`, m/s²). |
| $v_{\text{stop}}$ | Speed below which the ball is just considered stopped (`ballStopSpeed`). |
| $dt$ | Fixed time step. |

**Plain-English:** Every tick, the ball's speed drops by a fixed amount,
like friction from the turf. The ball keeps rolling in the same direction,
just slower. Once it's nearly stopped, it's snapped to a full stop instead
of crawling forever.

**Foot/ball contact and kick impulse.** The foot sits ahead of and lateral to the robot centre:

$$
\text{foot} = \big(x + f\cos\theta - \ell\sin\theta,\ \ y + f\sin\theta + \ell\cos\theta\big)
$$

| Symbol | Meaning |
|---|---|
| $x, y, \theta$ | Robot's field position and heading. |
| $f$ | Fixed forward offset from the robot's centre to the foot (`FOOT_FORWARD`). |
| $\ell$ | Sideways (lateral) offset — the stance bias — whose sign flips depending on which side of the robot the ball is currently on. |

**Plain-English:** This places the kicking foot a bit in front of the
robot's centre and a bit to one side, matching where a real foot would be
during a stride.

with forward offset $f$ and signed lateral offset $\ell$ (the stance bias, sign chosen by which side of the robot the ball is on). Foot velocity includes the rotational term at that offset:

$$
v_{\text{foot}} = \big(v_x\cos\theta - v_y\sin\theta - \dot\theta\,(\text{foot}_y-y),\ \ v_x\sin\theta + v_y\cos\theta + \dot\theta\,(\text{foot}_x-x)\big)
$$

| Symbol | Meaning |
|---|---|
| $v_x, v_y$ | Robot's linear speed (robot frame). |
| $\dot\theta$ | Robot's angular speed. |
| $(\text{foot}_x,\text{foot}_y)$ | Foot's field position, from the formula above. |
| $(x,y)$ | Robot's own centre — so $(\text{foot}_x-x,\ \text{foot}_y-y)$ is just the foot's offset from the centre. |

**Plain-English:** The foot moves for two reasons: the whole robot is
walking, and the whole robot is turning. Turning sweeps the foot sideways
even if the body isn't moving forward. This adds both effects together.

Closing speed onto the ball along the contact normal $\hat n$:

$$
c = (v_{\text{foot}} - v_{\text{ball}}) \cdot \hat n
$$

| Symbol | Meaning |
|---|---|
| $v_{\text{foot}}, v_{\text{ball}}$ | Foot's and ball's velocity vectors. |
| $\hat n$ | Unit vector pointing from the foot to the ball at the moment of contact. |
| $c$ | Resulting scalar closing speed. |

**Plain-English:** This measures how fast the foot is closing the gap on
the ball, along the direction that actually matters — straight into the
ball. A positive number means the foot is driving into the ball.

On contact ($c > 0.05\ \text{m/s}$), the outgoing ball direction takes Gaussian scatter plus a fixed bias, and speed is gained from closing speed:

$$
\begin{aligned}
\phi &= \operatorname{atan2}(\hat n_y,\hat n_x) + z\,\sigma_{\text{dir}} + b_{\text{dir}}, \qquad z \sim \mathcal N(0,1) \\
s &= c \cdot k_{\text{kick}} \cdot \big(1 + u\,j_{\text{speed}}\big), \qquad u \sim \mathcal U(-1,1) \\
v_{\text{ball}} &= \big(s\cos\phi,\ s\sin\phi\big)
\end{aligned}
$$

| Symbol | Meaning |
|---|---|
| $\phi$ | Outgoing ball direction. |
| $\hat n_x,\hat n_y$ | Contact normal's components. |
| $z$ | Fresh Gaussian random draw. |
| $\sigma_{\text{dir}}$ | Direction scatter $z$ is scaled by (`kickDirSigmaDeg`). |
| $b_{\text{dir}}$ | Fixed systematic angle bias (`kickDirBias`), modelling a real right-foot pull. |
| $s$ | Outgoing ball speed. |
| $c$ | Closing speed, from the formula above. |
| $k_{\text{kick}}$ | Kick-gain constant (`kickGain`). |
| $u$ | Fresh uniform random draw between $-1$ and $1$. |
| $j_{\text{speed}}$ | Speed-jitter fraction (`kickSpeedJitter`). |

**Plain-English:** When the foot actually strikes the ball, the ball flies
off roughly along the contact direction. A little random scatter and a
fixed sideways pull are added to that direction, since a real kick is never
perfectly straight. The outgoing speed is the foot's closing speed
multiplied up (a real foot moves much slower than the ball it launches),
with a bit of random variation on top.

**Torso (body) collision** — restricted to a rear/side cone via a bearing test — is a circle–circle separation with the ball pushed out to the sum of radii, and velocity clipped to the outward normal component only if still closing.

**Plain-English:** If the ball touches the robot's body instead of its
foot, the ball is just pushed back out so the two shapes don't overlap.
This only applies to the back and sides of the robot — a ball in front is
always the foot's business, not the torso's.

**Termination geometry** — comparing ball position against half field length/width $\tfrac{L}{2},\tfrac{W}{2}$ and half goal width $\tfrac{G}{2}$:

$$
\text{goal} \iff x>\tfrac{L}{2} \wedge |y|<\tfrac{G}{2}, \qquad
\text{out} \iff |x|>\tfrac{L}{2}+r_{\text{ball}} \vee |y|>\tfrac{W}{2}+r_{\text{ball}}
$$

| Symbol | Meaning |
|---|---|
| $x, y$ | Ball's field position. |
| $L, W$ | Full field length and width (14 m × 9 m). |
| $G$ | Goal mouth width. |
| $r_{\text{ball}}$ | Ball's radius, used to decide "out" only once the ball has fully crossed a line rather than just touched it. |

**Plain-English:** Every tick, the ball's position is checked against the
edges of the pitch and the goal mouth. Past the goal line and between the
posts means a goal. Past any edge otherwise means the ball went out.

**Field → robot-frame transform** (standard 2D rotation), used for `ballToRobot`:

$$
\begin{pmatrix}x'\\y'\end{pmatrix} =
\begin{pmatrix}\cos\theta & \sin\theta\\-\sin\theta & \cos\theta\end{pmatrix}
\begin{pmatrix}x_{\text{ball}}-x_{\text{robot}}\\y_{\text{ball}}-y_{\text{robot}}\end{pmatrix},
\qquad \text{range}=\sqrt{x'^2+y'^2},\quad \text{yaw}=\operatorname{atan2}(y',x')
$$

| Symbol | Meaning |
|---|---|
| $(x_{\text{ball}},y_{\text{ball}})$ | Ball's field position. |
| $(x_{\text{robot}},y_{\text{robot}})$ | Robot's field position. |
| $\theta$ | Robot's heading. |
| $(x',y')$ | Ball's position as seen from the robot's own point of view. |
| $\text{range}$ | Straight-line distance to the ball. |
| $\text{yaw}$ | Ball's bearing relative to the direction the robot is facing. |

**Plain-English:** This restates the ball's position from "where it is on
the field" to "where it is relative to the robot, facing forward." It's the
same rotation trick as the integration step above, just run in the other
direction.

### Perception model — `perception.js`

**Field-of-view test** — visible iff within the $120°$ cone and sight range $R$:

$$
\text{visible} \iff |\text{yaw}| \le 60° \ \wedge\ \text{range} \le R
$$

| Symbol | Meaning |
|---|---|
| $\text{yaw}, \text{range}$ | Ball's bearing and distance in the robot's own frame, from the transform above. |
| $R$ | Configured sight radius (`ballSightRangeM`, the "Field of vision radius" slider). |

**Plain-English:** The robot can only see the ball if it's within a cone in
front of it and not too far away. Outside that cone, or too far, the robot
simply can't see it this tick.

**Confidence decay** — exponential, tuned so it lands exactly on the confidence floor $C_0$ at $\text{range}=R$:

$$
k = \frac{\ln(100/C_0)}{R}, \qquad \text{confidence} = \max\!\big(C_0,\ 100\,e^{-k\cdot\text{range}}\big)
$$

| Symbol | Meaning |
|---|---|
| $C_0$ | Fixed confidence floor (50%). |
| $R$ | Sight radius. |
| $k$ | Decay rate, solved from $C_0$ and $R$ so the curve lands exactly on the floor at the edge of vision. |
| $\text{range}$ | Ball's current distance. |
| $\text{confidence}$ | Resulting confidence percentage. |

**Plain-English:** The closer the ball, the more confident the robot is
that it's really seeing it. Confidence starts near 100% up close and fades
smoothly down to a floor value by the edge of its sight range.

**Jitter growth** — noise sigma saturates from $0$ at the robot toward the configured intensity $I$ as range grows ($K=0.3$):

$$
\sigma(\text{range}) = I\big(1-e^{-K\cdot\text{range}}\big)
$$

| Symbol | Meaning |
|---|---|
| $I$ | Configured maximum noise level (`ballJitterIntensity`, the "Ball jitter intensity" slider, metres). |
| $K$ | Fixed growth-rate constant. |
| $\text{range}$ | Ball's distance. |
| $\sigma(\text{range})$ | Resulting noise standard deviation at that distance. |

**Plain-English:** Right next to the robot, the perceived ball position is
basically exact. Farther away, position noise grows, leveling off at a
maximum amount set by the "ball jitter intensity" slider.

applied as independent Gaussian noise on each axis of the perceived ball position: $p' = p + \mathcal N(0,\sigma^2)$.

| Symbol | Meaning |
|---|---|
| $p$ | Ball's true position on one axis (x or y, robot frame). |
| $p'$ | Perceived (noisy) position on that axis. |
| $\mathcal N(0,\sigma^2)$ | Gaussian random draw with mean 0 and the standard deviation computed above. |

**Plain-English:** That noise amount is then used to nudge the ball's
perceived x and y position slightly, in a random direction, so what the
robot "thinks" it sees can differ a little from the truth.

### Math primitives exposed to the interpreted C++ — `host.js`

Reimplements the brain's own `include/utils/math.h` helpers, since the pasted code calls into them:

$$
\operatorname{norm}(x,y)=\sqrt{x^2+y^2}, \qquad
\operatorname{cap}(x,\text{lo},\text{hi})=\max(\min(x,\text{hi}),\text{lo}), \qquad
\operatorname{sigmoid}(x)=\frac{1}{1+e^{s(x-\text{shift})}}
$$

| Symbol | Meaning |
|---|---|
| $x, y$ (in `norm`) | The two components of a 2D vector, e.g. a distance's $\Delta x,\Delta y$. |
| $x$ (in `cap`) | The value being clamped, between the bounds $\text{lo}$ and $\text{hi}$. |
| $x$ (in `sigmoid`) | The input value. |
| $\text{shift}$ | Moves the curve's midpoint left/right. |
| $s$ | Controls how sharply the sigmoid transitions. |

**Plain-English:** `norm` is just the straight-line distance formula.
`cap` squeezes a number so it never goes below a low limit or above a high
one. `sigmoid` is a smooth S-shaped curve, useful for a gradual on/off
switch instead of a sudden jump.

**Angle normalization into $(-\pi,\pi]$:**

$$
\operatorname{toPInPI}(\theta) = \Big(\theta+\pi+2n\pi\Big)\bmod 2\pi\ -\ \pi, \qquad n = \left\lfloor\left|\frac{\theta}{2\pi}\right|\right\rfloor+1
$$

| Symbol | Meaning |
|---|---|
| $\theta$ | Input angle, in radians, which can be any size (including many full turns). |
| $n$ | Whole-number correction term computed from $\theta$ itself, just large enough to guarantee the modulo result comes out positive before the final $-\pi$ shift. |

**Plain-English:** Angles wrap around, so 190° and -170° point the same
way. This rewrites any angle into one consistent range, so comparing two
angles never breaks just because one of them wrapped around.

**Line/segment geometry**, for a segment $l=(x_0,y_0)\!\to\!(x_1,y_1)$ and point $p$:

$$
\operatorname{cross}(a,b)=a_x b_y-a_y b_x, \qquad \operatorname{inner}(a,b)=a_xb_x+a_yb_y
$$

| Symbol | Meaning |
|---|---|
| $a, b$ | Any two 2D vectors, with components $a_x,a_y$ and $b_x,b_y$. |
| `cross` result | A single signed number (not a vector, since these are 2D). |
| `inner` result | Also a single number. |

**Plain-English:** These are two standard building blocks from vector math.
The cross product tells you which side of a line a point is on. The inner
(dot) product tells you how much two directions line up.

$$
\operatorname{perpDist}(p,l) = \frac{\operatorname{cross}(\vec l,\ p-l_0)}{\lVert \vec l\rVert}
$$

| Symbol | Meaning |
|---|---|
| $p$ | The point being measured. |
| $l$ | The line segment, with endpoints $l_0=(x_0,y_0)$ and $l_1=(x_1,y_1)$. |
| $\vec l$ | Direction vector of the segment, $l_1-l_0$. |
| $\lVert\vec l\rVert$ | Length of the segment. |

**Plain-English:** This measures how far a point is from an infinitely long
line, straight across at a right angle.

$$
\operatorname{minDist}(p,l) =
\begin{cases}
\lVert p-l_0\rVert & \operatorname{inner}(\vec l,\,p-l_0) < 0 \\
\lVert p-l_1\rVert & \operatorname{inner}(-\vec l,\,p-l_1) < 0 \\
|\operatorname{perpDist}(p,l)| & \text{otherwise}
\end{cases}
$$

| Symbol | Meaning |
|---|---|
| $p$, $l$, $l_0$, $l_1$, $\vec l$ | Same as the `perpDist` formula above. |
| $\lVert p-l_0\rVert$, $\lVert p-l_1\rVert$ | Plain straight-line distances from $p$ to each endpoint. |

**Plain-English:** A real line segment has two ends, not an infinite line.
This checks whether the closest point is off one end, off the other end, or
between them, and measures the distance accordingly.

**Goalpost bearings, shot-angle test, and kick-direction bisector:**

$$
\theta_{L,R} = \operatorname{atan2}\!\big(y_{L,R}-y_{\text{ball}},\ x_{\text{post}}-x_{\text{ball}}\big), \qquad
\operatorname{calcKickDir} = \operatorname{toPInPI}\!\left(\frac{\theta_L+\theta_R}{2}\right)
$$

| Symbol | Meaning |
|---|---|
| $\theta_L, \theta_R$ | Bearing angles from the ball to the left and right goalposts. |
| $(x_{\text{post}}, y_{L,R})$ | Each post's field position (same $x$, opposite $y$). |
| $(x_{\text{ball}},y_{\text{ball}})$ | Ball's position. |

**Plain-English:** This finds the compass direction from the ball to each
goalpost. The default kick direction just points straight between them, at
the middle of the goal mouth.

`isAngleGood` checks whether a candidate angle's normalized offset from $\theta_R$ is smaller than the posts' own angular separation — i.e. whether the angle falls inside the goalmouth's angular window (auto-widening the margin if that window is narrower than $120°$).

**Plain-English:** This checks whether a shot or kick angle is actually
aimed between the two posts, not wide of them.

**Walk-to-pose controller (`moveToPoseOnField2`).** Long-range mode turns to face the target then walks forward at range-independent capped speed with a hysteresis band ($0.9\times$ threshold) on the long/short switch; short-range mode is direct holonomic proportional control:

$$
\text{range} = \sqrt{(t_x-x)^2+(t_y-y)^2}, \qquad \theta_{\text{err}} = \operatorname{toPInPI}(\operatorname{atan2}(t_y-y,\,t_x-x)-\theta)
$$

$$
\text{short-range:}\quad (v_x,v_y) = \text{range}\cdot(\cos\theta_{\text{err}},\ \sin\theta_{\text{err}}), \qquad
\text{long-range:}\quad v_x = \operatorname{cap}(\text{range}, \pm v_{x,\max}),\ \ \dot\theta=\theta_{\text{err}}
$$

all three components finally clamped to their configured limits.

| Symbol | Meaning |
|---|---|
| $(t_x,t_y)$ | Target point being walked to. |
| $(x,y,\theta)$ | Robot's current pose. |
| $\text{range}$ | Straight-line distance to the target. |
| $\theta_{\text{err}}$ | Heading error between where the robot is facing and where the target actually is. |
| $v_{x,\max}$ | Long-range forward-speed cap (the `vxLimit` argument). |
| $v_x,v_y,\dot\theta$ | Resulting velocity command sent to the robot. |

**Plain-English:** This is the controller that walks the robot to a target
point. Far away, it turns to face the target first, then walks straight at
a steady capped speed. Close up, it walks directly at the target, moving
faster when farther away and automatically slowing down as it arrives —
that's what "speed equals distance" gives you for free.

### Telemetry curve reconstruction — `runtime.js` and `curves.js`

**Cubic Bézier** (standard Bernstein-basis evaluation), resampled at the same control points $P_0..P_3$ the interpreted C++ computed, so the drawn path matches exactly what the pasted code would do. The evaluation itself is `curves.js`'s `cubicBezierPoint`/`sampleCubicBezier` — one shared definition `runtime.js`'s live telemetry and the `/simulation-math` page's draggable demo both call, rather than two copies that could drift apart:

$$
B(s) = (1-s)^3P_0 + 3(1-s)^2sP_1 + 3(1-s)s^2P_2 + s^3P_3, \qquad s\in[0,1]
$$

| Symbol | Meaning |
|---|---|
| $P_0, P_3$ | Curve's start and end points, read from the interpreted C++'s own locals. |
| $P_1, P_2$ | The two "handle" points that pull the curve's shape, also read from the interpreted C++. |
| $s$ | Sweep parameter, stepped from 0 to 1 to trace the curve. |
| $B(s)$ | Resulting point on the curve at that step. |

**Plain-English:** A cubic Bézier curve is a smooth curve drawn between a
start point and an end point, pulled and shaped by two extra "handle"
points in between. Sliding $s$ from 0 to 1 traces the curve from start to
finish. It's the same curve type used in vector-drawing software.

**Exponential-decay long-range curve**, sampled in a frame $(\hat u,\hat v)$ aligned to the kick direction $\kappa$ ($\hat u = (\cos\kappa,\sin\kappa)$, $\hat v$ its perpendicular), then rotated back to field coordinates:

$$
u(s) = u_0(1-s), \qquad v(s) = v_0\,e^{-D\cdot s}, \qquad P(s) = \text{target} + u(s)\hat u + v(s)\hat v
$$

where $D$ is the decay constant read directly from the pasted code (default $4.0$).

| Symbol | Meaning |
|---|---|
| $\kappa$ | Kick direction angle. |
| $\hat u$ | Unit vector pointing along the kick direction. |
| $\hat v$ | Unit vector perpendicular to it. |
| $u_0, v_0$ | Curve's starting along-track and cross-track offsets (read from the interpreted C++). |
| $s$ | Sweep parameter from 0 to 1. |
| $D$ | Decay constant controlling how fast the sideways offset shrinks. |
| $\text{target}$ | Fixed aim point the curve approaches. |
| $P(s)$ | Resulting field-coordinate point at step $s$. |

**Plain-English:** This draws the wide sweeping curve the robot takes on a
long approach. Along the direction toward the target, it closes the gap
steadily. Sideways, it starts offset and that offset shrinks away
exponentially, fast at first and then leveling off — so the path curves in
hard early and then straightens out near the target.

### Real-time loop — `engine.js`

Fixed-timestep accumulator, decoupling physics from display refresh rate. Each animation frame adds elapsed wall-clock time to an accumulator and drains it in whole $dt=0.01\,\text{s}$ steps (matching the real brain's 100 Hz tick):

$$
\text{accum} \mathrel{+}= \Delta t_{\text{frame}}\cdot\text{speed}, \qquad
\text{while } \text{accum}\ge dt:\ \ \text{step}(dt),\ \ \text{accum}\mathrel{-}=dt
$$

so a run at 144 Hz and a run at 60 Hz produce identical trajectories.

| Symbol | Meaning |
|---|---|
| $\text{accum}$ | Leftover-time bucket. |
| $\Delta t_{\text{frame}}$ | How much real wall-clock time passed since the last animation frame. |
| $\text{speed}$ | Playback-speed multiplier ($0.5\times$/$1\times$/$2\times$). |
| $dt$ | Fixed physics step, $0.01\,\text{s}$. |

**Plain-English:** Screens don't all refresh at the same rate, but the
physics needs steady, equal-sized time steps to behave consistently. This
banks up real elapsed time in a bucket and spends it in fixed-size chunks,
so the simulation always advances by the same tiny step regardless of how
fast the screen is refreshing.

### Approach & Kick Time test — `approachKickTest.js`

**Circular placement** — 36 angles ($10°$ steps) × 3 repeats, robot always facing the ball:

$$
(r_x,r_y) = (x_{\text{ball}},y_{\text{ball}}) + \rho\,(\cos\alpha,\sin\alpha), \qquad
\theta = \operatorname{atan2}(y_{\text{ball}}-r_y,\ x_{\text{ball}}-r_x)
$$

| Symbol | Meaning |
|---|---|
| $(x_{\text{ball}},y_{\text{ball}})$ | Fixed ball position for the test. |
| $\rho$ | Sweep radius (the test's "Distance" setting). |
| $\alpha$ | Swept angle, stepped in $10°$ increments all the way around. |
| $(r_x,r_y)$ | Resulting robot start position. |
| $\theta$ | Robot's starting heading, pointed back at the ball. |

**Plain-English:** This scatters test starting points evenly around a
circle centred on the ball, at a fixed distance. Every angle of approach
gets its own test, and the robot always starts out facing the ball.

**Timing** — elapsed time is tick count between the first "chase/adjust" decision and the first "kick/cross" decision, scaled by $dt$; each angle's reported time is the plain arithmetic mean over its completed (non-timed-out) repeats:

$$
t_{\text{elapsed}} = (\text{tick}_{\text{kick}}-\text{tick}_{\text{start}})\cdot dt, \qquad
\bar t_\alpha = \frac{1}{n}\sum_{i=1}^n t_i
$$

| Symbol | Meaning |
|---|---|
| $\text{tick}_{\text{start}}$ | Tick number of the first "chase" or "adjust" decision. |
| $\text{tick}_{\text{kick}}$ | Tick number of the first "kick" or "cross" decision after it. |
| $dt$ | Fixed physics step. |
| $n$ | Number of completed repeats at a given angle $\alpha$ (out of 3). |
| $t_i$ | Each repeat's own elapsed time. |
| $\bar t_\alpha$ | Their average. |

**Plain-English:** The stopwatch starts once the robot begins approaching
the ball and stops once it starts kicking. That's converted from tick count
into seconds. Each starting angle is repeated a few times and then
averaged, to smooth out any randomness from one run to the next.

### Field ↔ SVG coordinate mapping — `field.js`

Affine transform, 60 px/m, with the y-axis flipped since SVG grows downward while field $+y$ is left:

$$
\text{toSvg}(x,y) = \big((x+7.5)\cdot 60,\ \ (5-y)\cdot 60\big)
$$

| Symbol | Meaning |
|---|---|
| $x, y$ | A position in field metres (origin at the centre circle). |
| $7.5, 5$ | Half the visible view width/height in metres, re-centring the origin to the top-left of the SVG canvas. |
| $60$ | Pixels-per-metre scale. |
| Output pair | The matching SVG pixel coordinate. |

**Plain-English:** This just converts real-world metres into on-screen
pixels, at 60 pixels per metre. The vertical axis is flipped because
screen pixels count downward from the top, while the field's own $+y$
direction points left/up.

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
