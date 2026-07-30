import { useEffect, useRef } from "react";
import Header from "../components/Header.jsx";
import "./LongRangePreview.css";

const CONTENT_HTML = `
<div class="app">
  <header class="top">
    <span class="eyebrow">TickChaseNode · brain_tree.cpp · StrikerChase</span>
    <h1>Long-range curve preview</h1>
    <p class="sub">
      Drag the striker and ball on the pitch (or edit the numbers) to check the proposed exponential-decay
      approach curve: no control points, no S-curve possible — the striker's lateral distance from the
      approach line (dashed, through the ball along kickDir) shrinks smoothly toward zero as it advances,
      so the path only ever turns one way — against every gating condition before it's written into
      <code>brain_tree.cpp</code>. Every constant below uses the same name as the plan
      (<code>okay-right-now-i-kind-flamingo.md</code>) so slider values map 1:1 onto the real code.
    </p>
  </header>

  <div class="layout">
    <section class="panel field-panel">
      <div class="field-wrap">
        <svg id="field" viewBox="0 0 900 600" xmlns="http://www.w3.org/2000/svg">
          <!-- static pitch, drawn once -->
          <g id="pitchStatic"></g>
          <!-- dynamic geometry, redrawn on every change -->
          <path id="wedgeCorridor" fill="var(--wedge-corridor)" stroke="none"></path>
          <path id="wedgeCone" fill="var(--wedge-robot)" stroke="none"></path>
          <line id="lineGoalBall" stroke-dasharray="2 4"></line>
          <line id="lineStraightRef" stroke-dasharray="3 5"></line>
          <circle id="handoffCircle" fill="none" stroke-dasharray="4 4"></circle>
          <line id="lineFoot" stroke-dasharray="2 3"></line>
          <circle id="footDot" r="5"></circle>
          <path id="curveActive" fill="none"></path>
          <path id="curveFallback" fill="none" stroke-dasharray="6 5"></path>
          <path id="curveLive" fill="none" style="display:none"></path>
          <circle id="lookaheadDot"></circle>
          <circle id="animDot"></circle>
          <g id="ballGroup">
            <circle id="ballHandle" r="9"></circle>
            <text class="label" y="-14" text-anchor="middle">BALL</text>
          </g>
          <g id="goalGroup">
            <text class="label" x="-34" y="-90" text-anchor="middle">GOAL (7, 0)</text>
          </g>
          <g id="robotGroup">
            <line id="headingLine" stroke-width="3"></line>
            <circle id="robotHandle" r="13"></circle>
            <circle id="headingHandle" r="7"></circle>
            <text class="label" y="-22" text-anchor="middle">STRIKER</text>
          </g>
        </svg>
      </div>
      <div class="legend">
        <span><i class="swatch" style="background:var(--accent)"></i>planned curve (from marker position)</span>
        <span><i class="swatch" style="background:var(--fallback)"></i>straight-line fallback (today's behavior)</span>
        <span><i class="swatch" style="background:var(--muted-2)"></i>approach line (through ball, along kickDir)</span>
        <span><i class="dot" style="background:var(--muted-2)"></i>foot point (striker's position projected onto the line)</span>
        <span><i class="dot" style="background:var(--robot-fill)"></i>pure-pursuit lookahead target</span>
        <span><i class="swatch" style="background:var(--muted-2);height:1px"></i>handoff boundary (1.5&nbsp;m default)</span>
        <span><i class="dot" style="background:var(--wedge-robot);border:1px solid var(--robot-fill)"></i>ball-in-front cone</span>
        <span><i class="dot" style="background:var(--wedge-corridor);border:1px solid var(--accent)"></i>orientation corridor</span>
      </div>
      <p class="field-caption">
        Pitch drawn to FD_ADULTSIZE (types.h): length 14 m, width 9 m, opponent goal fixed at (fd.length/2, 0) = (7, 0),
        matching <code>goal_center_x = -7.0</code> in config_local.yaml. kickDir here is simplified to
        atan2(goal − ball) — the real <code>calcKickDir()</code> also nudges this off goalpost angles/obstruction margins.
      </p>
    </section>

    <aside class="panel console">
      <div id="statePill" class="state-pill">
        <span class="dotlight"></span><span id="stateText">—</span>
      </div>

      <div class="peak-stat" id="peakStat">
        <span class="peak-label">Closed by 25% progress</span>
        <span class="peak-value" id="closed25Value">—</span>
        <span class="peak-target">of initial lateral offset corrected</span>
      </div>
      <div class="peak-stat" id="residualStat">
        <span class="peak-label">Residual at arrival</span>
        <span class="peak-value" id="residualValue">—</span>
        <span class="peak-target">should be ≈0% — no overshoot</span>
      </div>

      <div class="readout" id="readout"></div>

      <div class="control-group">
        <h3 class="group-title">Positions</h3>
        <div class="field-row">
          <div class="num-field"><label for="rx">Striker X (m)</label><input type="number" id="rx" step="0.1"></div>
          <div class="num-field"><label for="ry">Striker Y (m)</label><input type="number" id="ry" step="0.1"></div>
        </div>
        <div class="field-row">
          <div class="num-field"><label for="rt">Striker θ (deg)</label><input type="number" id="rt" step="1"></div>
          <div class="num-field"><label>&nbsp;</label><button type="button" id="faceBallBtn">Face ball</button></div>
        </div>
        <div class="field-row">
          <div class="num-field"><label for="bx">Ball X (m)</label><input type="number" id="bx" step="0.1"></div>
          <div class="num-field"><label for="by">Ball Y (m)</label><input type="number" id="by" step="0.1"></div>
        </div>
      </div>

      <div class="control-group">
        <h3 class="group-title">Approach</h3>
        <div class="slider-field">
          <div class="slider-head"><label for="dist">dist (kick stand-off)</label><span class="val" id="dist-val"></span></div>
          <input type="range" id="dist" min="0.1" max="1.0" step="0.01">
        </div>
      </div>

      <div class="control-group">
        <h3 class="group-title">Gating thresholds</h3>
        <div class="slider-field">
          <div class="slider-head"><label for="actDist">FAR_CURVE_ACTIVATION_DIST</label><span class="val" id="actDist-val"></span></div>
          <input type="range" id="actDist" min="0.5" max="3.0" step="0.05">
        </div>
        <div class="slider-field">
          <div class="slider-head"><label for="orientTol">FAR_CURVE_ORIENTATION_TOLERANCE</label><span class="val" id="orientTol-val"></span></div>
          <input type="range" id="orientTol" min="5" max="180" step="1">
        </div>
        <div class="slider-field">
          <div class="slider-head"><label for="frontCone">FAR_CURVE_BALL_FRONT_CONE</label><span class="val" id="frontCone-val"></span></div>
          <input type="range" id="frontCone" min="5" max="180" step="1">
        </div>
      </div>

      <div class="control-group">
        <h3 class="group-title">Curve shape</h3>
        <div class="slider-field">
          <div class="slider-head"><label for="decayConst">FAR_CURVE_DECAY_CONST</label><span class="val" id="decayConst-val"></span></div>
          <input type="range" id="decayConst" min="0.5" max="10" step="0.1">
        </div>
        <div class="slider-field">
          <div class="slider-head"><label for="lookahead">FAR_CURVE_LOOKAHEAD (m)</label><span class="val" id="lookahead-val"></span></div>
          <input type="range" id="lookahead" min="0.1" max="1.0" step="0.01">
        </div>
      </div>

      <div class="actions">
        <button id="playBtn" class="primary">▶ Play walk-in</button>
        <button id="resetBtn">Reset</button>
      </div>
      <label class="checkbox-field"><input type="checkbox" id="showGeom" checked> Show gating geometry (cone + corridor)</label>
    </aside>
  </div>

  <details class="formula-ref" open>
    <summary>Formula reference — reproduced verbatim from the plan, §3</summary>
    <div class="ref-body">
      <p>This is exactly what the sliders and drag handles above are wired to. If a number on screen doesn't match what you'd get hand-computing this, that's a bug in the artifact, not the plan.</p>
      <pre class="code-block">P3 = directTarget_f = { ball.x - dist*cos(kickDir), ball.y - dist*sin(kickDir) }
oppGoalPt            = (goalOnNegativeX ? fd.length/2 : -fd.length/2, 0)   // = (7, 0) here
angDiff              = |toPInPI(kickDir - theta_rb)|            // theta_rb = robot→ball angle
ballYaw              = ball bearing relative to robot heading (brain-&gt;data-&gt;ball.yawToRobot)
distToApproachTarget = norm(directTarget_f - robotPos)

farEnough          = distToApproachTarget &gt; FAR_CURVE_ACTIVATION_DIST      // default 1.5 m
ballInFrontCone     = |toPInPI(ballYaw)| &lt; FAR_CURVE_BALL_FRONT_CONE        // default 120°
orientationAligned  = angDiff &lt; FAR_CURVE_ORIENTATION_TOLERANCE            // default 60°
longRangeCurveActive = isStrikerChase &amp;&amp; farEnough &amp;&amp; ballInFrontCone &amp;&amp; orientationAligned</pre>
      <pre class="code-block">// Local frame aligned with the approach line: longitudinal axis along kickDir,
// lateral axis rotated +90 degrees from it.
ux, uy = cos(kickDir), sin(kickDir)
vx, vy = -sin(kickDir), cos(kickDir)

// Striker's position in that frame, relative to the ball-target (P3) as origin.
u0 = (robotPos - P3) · (ux, uy)   // longitudinal offset (negative: striker is behind the ball)
v0 = (robotPos - P3) · (vx, vy)   // lateral offset from the approach line (signed)

// u(t) advances linearly from u0 (striker) to 0 (ball-target).
// v(t) decays exponentially from v0 toward 0 — same sign as v0 for every t, so the
// path only ever turns one way: no S-curve, no overshoot, no inflection point.
u(t) = u0 * (1 - t)
v(t) = v0 * exp(-FAR_CURVE_DECAY_CONST * t)
B(t) = P3 + u(t)*(ux,uy) + v(t)*(vx,vy)     // B(0) = robotPos exactly, B(1) ≈ P3

target_f = first B(t) with |B(t) - robotPos| &gt;= FAR_CURVE_LOOKAHEAD   // pure-pursuit target
bezierActive = true   // reuses the existing curved-motion velocity branch, brain_tree.cpp:1500-1515
                       // (name is legacy from the close-range Bezier — this curve isn't one)</pre>
      <p><strong>Revision history:</strong> draft 1 bowed perpendicular to the robot→ball-target chord using
      an exponential decay — arrived facing back the way it came, and had a non-zero offset at the robot's
      own position. Draft 2 fixed both with a quadratic Bezier (1 control point) locked to kickDir at
      arrival, but its peak curvature couldn't be pulled earlier than ~25% of the distance. Draft 3 split
      that into a cubic Bezier (2 control points, both tangent-locked to kickDir) to control that — but
      locking the tangent to the <em>same</em> direction at both ends forces the net turning over the whole
      path to be zero, which mathematically requires an S-curve (bend one way, then the other) whenever
      there's lateral ground to cover. Tested against striker (-4,-3) / ball (0,0) / goal (7,0) — approach
      line = the x-axis — and confirmed: it bent away from the line before bending back. This draft drops
      Bezier control points entirely in favor of the exponential-decay formula above, which is provably
      single-signed in curvature for its entire length (see the plan's §3 for the derivation) — see the
      "Closed by 25%" / "Residual at arrival" readouts above.</p>
    </div>
  </details>
</div>
`;

// Ported verbatim from the original artifact's <script>, only wrapped so it can be
// mounted/torn down by a React effect instead of running once at page load.
function initInteractive(root) {
  const PXPM = 60;
  const toSvg = (x, y) => [(x + 7.5) * PXPM, (5 - y) * PXPM];
  const toField = (sx, sy) => [sx / PXPM - 7.5, 5 - sy / PXPM];

  const svg = root.querySelector("#field");
  const wrapPi = (a) => {
    a = (((a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    return a;
  };
  const deg = (r) => (r * 180) / Math.PI;
  const rad = (d) => (d * Math.PI) / 180;
  const norm = (x, y) => Math.hypot(x, y);

  const FD = { length: 14, width: 9, goalWidth: 2.6, penaltyAreaLength: 3, penaltyAreaWidth: 6, goalAreaLength: 1, goalAreaWidth: 4, circleRadius: 1.5 };
  const goal = { x: FD.length / 2, y: 0 };

  let robot = { x: -4.0, y: -3.0, theta: 0 };
  let ball = { x: 0.0, y: 0.0 };
  robot.theta = Math.atan2(ball.y - robot.y, ball.x - robot.x);

  const params = {
    dist: 0.38,
    actDist: 1.5,
    orientTolDeg: 60,
    frontConeDeg: 120,
    decayConst: 4.0,
    lookahead: 0.3,
  };

  function buildPitch() {
    const g = root.querySelector("#pitchStatic");
    const ns = "http://www.w3.org/2000/svg";
    const line = (x1, y1, x2, y2, w) => {
      const [sx1, sy1] = toSvg(x1, y1), [sx2, sy2] = toSvg(x2, y2);
      const el = document.createElementNS(ns, "line");
      el.setAttribute("x1", sx1); el.setAttribute("y1", sy1);
      el.setAttribute("x2", sx2); el.setAttribute("y2", sy2);
      el.setAttribute("stroke", "var(--turf-line)"); el.setAttribute("stroke-width", w || 2);
      g.appendChild(el);
    };
    const circle = (cx, cy, r) => {
      const [sx, sy] = toSvg(cx, cy);
      const el = document.createElementNS(ns, "circle");
      el.setAttribute("cx", sx); el.setAttribute("cy", sy); el.setAttribute("r", r * PXPM);
      el.setAttribute("fill", "none"); el.setAttribute("stroke", "var(--turf-line)"); el.setAttribute("stroke-width", 2);
      g.appendChild(el);
    };
    const hl = FD.length / 2, hw = FD.width / 2;
    line(-hl, -hw, hl, -hw, 2.5); line(-hl, hw, hl, hw, 2.5);
    line(-hl, -hw, -hl, hw, 2.5); line(hl, -hw, hl, hw, 2.5);
    line(0, -hw, 0, hw, 2);
    circle(0, 0, FD.circleRadius);
    const pL = FD.penaltyAreaLength, pW = FD.penaltyAreaWidth / 2;
    line(hl - pL, -pW, hl - pL, pW, 2); line(hl - pL, -pW, hl, -pW, 2); line(hl - pL, pW, hl, pW, 2);
    const gL = FD.goalAreaLength, gW = FD.goalAreaWidth / 2;
    line(hl - gL, -gW, hl - gL, gW, 2); line(hl - gL, -gW, hl, -gW, 2); line(hl - gL, gW, hl, gW, 2);
    line(hl, -FD.goalWidth / 2, hl, FD.goalWidth / 2, 5);
  }
  buildPitch();

  const el = (id) => root.querySelector("#" + id);
  const $robotGroup = el("robotGroup"), $robotHandle = el("robotHandle"), $headingLine = el("headingLine"),
        $headingHandle = el("headingHandle"), $ballGroup = el("ballGroup"), $ballHandle = el("ballHandle"),
        $goalGroup = el("goalGroup"), $lineGoalBall = el("lineGoalBall"), $lineStraightRef = el("lineStraightRef"),
        $handoffCircle = el("handoffCircle"), $curveActive = el("curveActive"), $curveFallback = el("curveFallback"),
        $curveLive = el("curveLive"), $lookaheadDot = el("lookaheadDot"), $animDot = el("animDot"),
        $wedgeCone = el("wedgeCone"), $wedgeCorridor = el("wedgeCorridor"),
        $lineFoot = el("lineFoot"), $footDot = el("footDot");

  $robotHandle.setAttribute("fill", "var(--robot-fill)"); $robotHandle.setAttribute("stroke", "var(--panel)"); $robotHandle.setAttribute("stroke-width", 2);
  $headingHandle.setAttribute("fill", "var(--panel)"); $headingHandle.setAttribute("stroke", "var(--robot-fill)"); $headingHandle.setAttribute("stroke-width", 2.5);
  $headingLine.setAttribute("stroke", "var(--robot-fill)");
  $ballHandle.setAttribute("fill", "var(--ball-fill)"); $ballHandle.setAttribute("stroke", "var(--ball-stroke)"); $ballHandle.setAttribute("stroke-width", 2);
  $lineGoalBall.setAttribute("stroke", "var(--muted-2)"); $lineGoalBall.setAttribute("stroke-width", 1.5);
  $lineStraightRef.setAttribute("stroke", "var(--fallback)"); $lineStraightRef.setAttribute("stroke-width", 1.5);
  $handoffCircle.setAttribute("stroke", "var(--muted-2)"); $handoffCircle.setAttribute("stroke-width", 1.5);
  $curveActive.setAttribute("stroke", "var(--accent)"); $curveActive.setAttribute("stroke-width", 3.5); $curveActive.setAttribute("stroke-linecap", "round");
  $curveFallback.setAttribute("stroke", "var(--fallback)"); $curveFallback.setAttribute("stroke-width", 3);
  $curveLive.setAttribute("stroke", "var(--accent)"); $curveLive.setAttribute("stroke-width", 4); $curveLive.setAttribute("stroke-linecap", "round"); $curveLive.setAttribute("stroke-opacity", 0.95);
  $lookaheadDot.setAttribute("r", 6); $lookaheadDot.setAttribute("fill", "var(--robot-fill)"); $lookaheadDot.setAttribute("stroke", "var(--panel)"); $lookaheadDot.setAttribute("stroke-width", 2);
  $animDot.setAttribute("r", 8); $animDot.setAttribute("fill", "var(--accent)"); $animDot.setAttribute("stroke", "var(--panel)"); $animDot.setAttribute("stroke-width", 2); $animDot.style.display = "none";
  $lineFoot.setAttribute("stroke", "var(--muted-2)"); $lineFoot.setAttribute("stroke-width", 1.25);
  $footDot.setAttribute("fill", "var(--panel)"); $footDot.setAttribute("stroke", "var(--muted-2)"); $footDot.setAttribute("stroke-width", 2);

  const cx = { rx: el("rx"), ry: el("ry"), rt: el("rt"), bx: el("bx"), by: el("by") };
  const sl = {
    dist: el("dist"), actDist: el("actDist"), orientTol: el("orientTol"), frontCone: el("frontCone"),
    decayConst: el("decayConst"), lookahead: el("lookahead"),
  };
  const slVal = (k) => el(k + "-val");

  function syncInputsFromState() {
    cx.rx.value = robot.x.toFixed(2); cx.ry.value = robot.y.toFixed(2); cx.rt.value = deg(robot.theta).toFixed(0);
    cx.bx.value = ball.x.toFixed(2); cx.by.value = ball.y.toFixed(2);
    sl.dist.value = params.dist; sl.actDist.value = params.actDist;
    sl.orientTol.value = params.orientTolDeg; sl.frontCone.value = params.frontConeDeg;
    sl.decayConst.value = params.decayConst; sl.lookahead.value = params.lookahead;
    slVal("dist").textContent = params.dist.toFixed(2) + " m";
    slVal("actDist").textContent = params.actDist.toFixed(2) + " m";
    slVal("orientTol").textContent = params.orientTolDeg.toFixed(0) + "°";
    slVal("frontCone").textContent = params.frontConeDeg.toFixed(0) + "°";
    slVal("decayConst").textContent = params.decayConst.toFixed(1);
    slVal("lookahead").textContent = params.lookahead.toFixed(2) + " m";
  }

  function compute(robotState) {
    const r = robotState || robot;
    const kickDir = Math.atan2(goal.y - ball.y, goal.x - ball.x);
    const theta_rb = Math.atan2(ball.y - r.y, ball.x - r.x);
    const ballYaw = wrapPi(theta_rb - r.theta);
    const angDiff = Math.abs(wrapPi(kickDir - theta_rb));
    const directTarget = { x: ball.x - params.dist * Math.cos(kickDir), y: ball.y - params.dist * Math.sin(kickDir) };
    const distToApproachTarget = norm(directTarget.x - r.x, directTarget.y - r.y);

    const farEnough = distToApproachTarget > params.actDist;
    const ballInFrontCone = Math.abs(ballYaw) < rad(params.frontConeDeg);
    const orientationAligned = angDiff < rad(params.orientTolDeg);
    const longRangeCurveActive = farEnough && ballInFrontCone && orientationAligned;

    const ux = Math.cos(kickDir), uy = Math.sin(kickDir);
    const vx = -Math.sin(kickDir), vy = Math.cos(kickDir);
    const dx0 = r.x - directTarget.x, dy0 = r.y - directTarget.y;
    const u0 = dx0 * ux + dy0 * uy;
    const v0 = dx0 * vx + dy0 * vy;

    return { kickDir, theta_rb, ballYaw, angDiff, directTarget, distToApproachTarget, farEnough, ballInFrontCone, orientationAligned, longRangeCurveActive, ux, uy, vx, vy, u0, v0 };
  }

  function curvePoint(r, d, t) {
    const u = d.u0 * (1 - t);
    const v = d.v0 * Math.exp(-params.decayConst * t);
    return {
      x: d.directTarget.x + u * d.ux + v * d.vx,
      y: d.directTarget.y + u * d.uy + v * d.vy,
    };
  }

  function lookaheadTarget(r, d) {
    let last = d.directTarget;
    for (let t = 0.02; t <= 1.0001; t += 0.02) {
      const p = curvePoint(r, d, t);
      if (norm(p.x - r.x, p.y - r.y) >= params.lookahead) return p;
      last = p;
    }
    return last;
  }

  function correctionStats() {
    const closedAt25 = 1 - Math.exp(-params.decayConst * 0.25);
    const residualAtArrival = Math.exp(-params.decayConst * 1.0);
    return { closedAt25, residualAtArrival };
  }

  function wedgePath(apexField, dirRad, halfAngleRad, radiusM) {
    const N = 24;
    let d = "";
    const [ax, ay] = toSvg(apexField.x, apexField.y);
    d += `M ${ax} ${ay} `;
    for (let i = 0; i <= N; i++) {
      const a = dirRad - halfAngleRad + (2 * halfAngleRad) * (i / N);
      const px = apexField.x + radiusM * Math.cos(a), py = apexField.y + radiusM * Math.sin(a);
      const [sx, sy] = toSvg(px, py);
      d += `L ${sx} ${sy} `;
    }
    d += "Z";
    return d;
  }

  function render() {
    const d = compute(robot);

    const [rsx, rsy] = toSvg(robot.x, robot.y);
    $robotGroup.setAttribute("transform", `translate(${rsx}, ${rsy})`);
    $robotHandle.setAttribute("cx", 0); $robotHandle.setAttribute("cy", 0);
    const hlen = 30;
    const hx = hlen * Math.cos(robot.theta), hy = -hlen * Math.sin(robot.theta);
    $headingLine.setAttribute("x1", 0); $headingLine.setAttribute("y1", 0);
    $headingLine.setAttribute("x2", hx); $headingLine.setAttribute("y2", hy);
    $headingHandle.setAttribute("cx", hx); $headingHandle.setAttribute("cy", hy);

    const [bsx, bsy] = toSvg(ball.x, ball.y);
    $ballGroup.setAttribute("transform", `translate(${bsx}, ${bsy})`);

    const [gsx, gsy] = toSvg(goal.x, goal.y);
    $goalGroup.setAttribute("transform", `translate(${gsx}, ${gsy})`);

    const [rtx1, rty1] = toSvg(robot.x, robot.y), [rtx2, rty2] = toSvg(d.directTarget.x, d.directTarget.y);
    $lineStraightRef.setAttribute("x1", rtx1); $lineStraightRef.setAttribute("y1", rty1);
    $lineStraightRef.setAttribute("x2", rtx2); $lineStraightRef.setAttribute("y2", rty2);

    const [htx, hty] = toSvg(d.directTarget.x, d.directTarget.y);
    $handoffCircle.setAttribute("cx", htx); $handoffCircle.setAttribute("cy", hty);
    $handoffCircle.setAttribute("r", params.actDist * PXPM);

    const lineBack = { x: d.directTarget.x - d.ux * 3, y: d.directTarget.y - d.uy * 3 };
    const lineFwd = goal;
    const [lbx, lby] = toSvg(lineBack.x, lineBack.y), [lfx, lfy] = toSvg(lineFwd.x, lineFwd.y);
    $lineGoalBall.setAttribute("x1", lbx); $lineGoalBall.setAttribute("y1", lby);
    $lineGoalBall.setAttribute("x2", lfx); $lineGoalBall.setAttribute("y2", lfy);

    if (d.longRangeCurveActive) {
      let path = "";
      for (let t = 0; t <= 1.0001; t += 0.02) {
        const p = curvePoint(robot, d, Math.min(t, 1));
        const [sx, sy] = toSvg(p.x, p.y);
        path += (t === 0 ? "M " : "L ") + sx + " " + sy + " ";
      }
      $curveActive.setAttribute("d", path);
      $curveFallback.setAttribute("d", "");
      const lt = lookaheadTarget(robot, d);
      const [lsx, lsy] = toSvg(lt.x, lt.y);
      $lookaheadDot.setAttribute("cx", lsx); $lookaheadDot.setAttribute("cy", lsy);
      $lookaheadDot.style.display = "block";

      const foot = { x: d.directTarget.x + d.u0 * d.ux, y: d.directTarget.y + d.u0 * d.uy };
      const [fsx, fsy] = toSvg(foot.x, foot.y);
      $lineFoot.setAttribute("x1", rtx1); $lineFoot.setAttribute("y1", rty1);
      $lineFoot.setAttribute("x2", fsx); $lineFoot.setAttribute("y2", fsy);
      $footDot.setAttribute("cx", fsx); $footDot.setAttribute("cy", fsy);
      $lineFoot.style.display = "block"; $footDot.style.display = "block";

      const stats = correctionStats();
      el("closed25Value").textContent = (stats.closedAt25 * 100).toFixed(0) + "%";
      el("closed25Value").className = "peak-value " + (stats.closedAt25 >= 0.5 ? "pass" : "fail");
      el("residualValue").textContent = (stats.residualAtArrival * 100).toFixed(1) + "%";
      el("residualValue").className = "peak-value " + (stats.residualAtArrival <= 0.1 ? "pass" : "fail");
    } else {
      $curveActive.setAttribute("d", "");
      $curveFallback.setAttribute("d", `M ${rtx1} ${rty1} L ${rtx2} ${rty2}`);
      $lookaheadDot.style.display = "none";
      $lineFoot.style.display = "none"; $footDot.style.display = "none";
      el("closed25Value").textContent = "—"; el("closed25Value").className = "peak-value";
      el("residualValue").textContent = "—"; el("residualValue").className = "peak-value";
    }

    if (el("showGeom").checked) {
      $wedgeCone.setAttribute("d", wedgePath(robot, robot.theta, rad(params.frontConeDeg), 3.6));
      $wedgeCone.setAttribute("stroke", "var(--robot-fill)"); $wedgeCone.setAttribute("stroke-width", 1); $wedgeCone.setAttribute("stroke-opacity", 0.35);
      $wedgeCorridor.setAttribute("d", wedgePath(ball, d.kickDir + Math.PI, rad(params.orientTolDeg), 5.2));
      $wedgeCorridor.setAttribute("stroke", "var(--accent)"); $wedgeCorridor.setAttribute("stroke-width", 1); $wedgeCorridor.setAttribute("stroke-opacity", 0.35);
      $wedgeCone.style.display = "block"; $wedgeCorridor.style.display = "block";
    } else {
      $wedgeCone.style.display = "none"; $wedgeCorridor.style.display = "none";
    }

    const pill = el("statePill"), stateText = el("stateText");
    pill.classList.remove("state-active", "state-fallback", "state-handoff");
    if (!d.farEnough) {
      pill.classList.add("state-handoff");
      stateText.textContent = "WITHIN 1.5 m → EXISTING CLOSE-RANGE BÉZIER (unchanged, not modeled here)";
    } else if (d.longRangeCurveActive) {
      pill.classList.add("state-active");
      stateText.textContent = "LONG-RANGE CURVE ACTIVE";
    } else {
      pill.classList.add("state-fallback");
      stateText.textContent = "GATES NOT MET → today's straight-line approach (unchanged)";
    }

    const row = (k, v, cls) => `<div class="row"><span class="k">${k}</span><span class="v ${cls || ""}">${v}</span></div>`;
    el("readout").innerHTML =
      row("distToApproachTarget", d.distToApproachTarget.toFixed(2) + " m") +
      row("kickDir (ball→goal)", deg(d.kickDir).toFixed(1) + "°") +
      row("theta_rb (robot→ball)", deg(d.theta_rb).toFixed(1) + "°") +
      row("angDiff", deg(d.angDiff).toFixed(1) + "°") +
      row("ballYaw", deg(d.ballYaw).toFixed(1) + "°") +
      row("u0 (longitudinal, behind ball)", d.u0.toFixed(2) + " m") +
      row("v0 (initial lateral offset)", d.v0.toFixed(2) + " m") +
      "<hr>" +
      row("farEnough (&gt; " + params.actDist.toFixed(2) + " m)", d.farEnough ? "PASS" : "FAIL", d.farEnough ? "pass" : "fail") +
      row("ballInFrontCone (&lt; " + params.frontConeDeg.toFixed(0) + "°)", d.ballInFrontCone ? "PASS" : "FAIL", d.ballInFrontCone ? "pass" : "fail") +
      row("orientationAligned (&lt; " + params.orientTolDeg.toFixed(0) + "°)", d.orientationAligned ? "PASS" : "FAIL", d.orientationAligned ? "pass" : "fail");
  }

  function clientToField(evt) {
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX; pt.y = evt.clientY;
    const m = svg.getScreenCTM().inverse();
    const p = pt.matrixTransform(m);
    return toField(p.x, p.y);
  }
  const cleanupFns = [];
  function makeDraggable(handleEl, onMove) {
    handleEl.style.cursor = "grab";
    const down = (evt) => {
      evt.preventDefault();
      handleEl.setPointerCapture(evt.pointerId);
      handleEl.style.cursor = "grabbing";
      const move = (e) => { onMove(clientToField(e)); syncInputsFromState(); render(); };
      const up = () => {
        handleEl.style.cursor = "grab";
        handleEl.removeEventListener("pointermove", move);
        handleEl.removeEventListener("pointerup", up);
      };
      handleEl.addEventListener("pointermove", move);
      handleEl.addEventListener("pointerup", up);
    };
    handleEl.addEventListener("pointerdown", down);
    cleanupFns.push(() => handleEl.removeEventListener("pointerdown", down));
  }
  makeDraggable($robotHandle, ([fx, fy]) => { robot.x = fx; robot.y = fy; });
  makeDraggable($ballHandle, ([fx, fy]) => { ball.x = fx; ball.y = fy; });
  makeDraggable($headingHandle, ([fx, fy]) => { robot.theta = Math.atan2(fy - robot.y, fx - robot.x); });

  const wireInput = (elm, evt, fn) => {
    elm.addEventListener(evt, fn);
    cleanupFns.push(() => elm.removeEventListener(evt, fn));
  };

  wireInput(cx.rx, "input", () => { robot.x = parseFloat(cx.rx.value) || 0; render(); });
  wireInput(cx.ry, "input", () => { robot.y = parseFloat(cx.ry.value) || 0; render(); });
  wireInput(cx.rt, "input", () => { robot.theta = rad(parseFloat(cx.rt.value) || 0); render(); });
  wireInput(cx.bx, "input", () => { ball.x = parseFloat(cx.bx.value) || 0; render(); });
  wireInput(cx.by, "input", () => { ball.y = parseFloat(cx.by.value) || 0; render(); });

  wireInput(sl.dist, "input", () => { params.dist = parseFloat(sl.dist.value); syncInputsFromState(); render(); });
  wireInput(sl.actDist, "input", () => { params.actDist = parseFloat(sl.actDist.value); syncInputsFromState(); render(); });
  wireInput(sl.orientTol, "input", () => { params.orientTolDeg = parseFloat(sl.orientTol.value); syncInputsFromState(); render(); });
  wireInput(sl.frontCone, "input", () => { params.frontConeDeg = parseFloat(sl.frontCone.value); syncInputsFromState(); render(); });
  wireInput(sl.decayConst, "input", () => { params.decayConst = parseFloat(sl.decayConst.value); syncInputsFromState(); render(); });
  wireInput(sl.lookahead, "input", () => { params.lookahead = parseFloat(sl.lookahead.value); syncInputsFromState(); render(); });
  wireInput(el("showGeom"), "change", render);

  wireInput(el("faceBallBtn"), "click", () => {
    robot.theta = Math.atan2(ball.y - robot.y, ball.x - robot.x);
    syncInputsFromState(); render();
  });

  let animRAF = null, animRobot = null, playing = false;
  const playBtn = el("playBtn");

  function stopAnim() {
    if (animRAF) cancelAnimationFrame(animRAF);
    animRAF = null; playing = false;
    playBtn.textContent = "▶ Play walk-in";
    $animDot.style.display = "none";
    $curveLive.style.display = "none";
    $curveActive.style.opacity = 1; $curveFallback.style.opacity = 1;
  }

  function updateLiveCurve(animR, d) {
    let path;
    if (d.longRangeCurveActive) {
      path = "";
      for (let t = 0; t <= 1.0001; t += 0.05) {
        const p = curvePoint(animR, d, Math.min(t, 1));
        const [sx, sy] = toSvg(p.x, p.y);
        path += (t === 0 ? "M " : "L ") + sx + " " + sy + " ";
      }
    } else {
      const [x1, y1] = toSvg(animR.x, animR.y);
      const [x2, y2] = toSvg(d.directTarget.x, d.directTarget.y);
      path = `M ${x1} ${y1} L ${x2} ${y2}`;
    }
    $curveLive.setAttribute("d", path);
  }

  function stepAnim() {
    const d = compute(animRobot);
    if (!d.farEnough) { stopAnim(); return; }
    updateLiveCurve(animRobot, d);
    const target = d.longRangeCurveActive ? lookaheadTarget(animRobot, d) : d.directTarget;
    const dx = target.x - animRobot.x, dy = target.y - animRobot.y;
    const distTo = norm(dx, dy);
    const speed = 0.028;
    const step = Math.min(speed, distTo);
    if (distTo > 1e-4) {
      animRobot.x += (dx / distTo) * step;
      animRobot.y += (dy / distTo) * step;
      animRobot.theta = Math.atan2(dy, dx);
    }
    const [sx, sy] = toSvg(animRobot.x, animRobot.y);
    $animDot.setAttribute("cx", sx); $animDot.setAttribute("cy", sy);
    animRAF = requestAnimationFrame(stepAnim);
  }

  wireInput(playBtn, "click", () => {
    if (playing) { stopAnim(); return; }
    animRobot = { x: robot.x, y: robot.y, theta: robot.theta };
    playing = true;
    playBtn.textContent = "⏸ Pause";
    $animDot.style.display = "block";
    $curveLive.style.display = "block";
    $curveActive.style.opacity = 0.25; $curveFallback.style.opacity = 0.25;
    animRAF = requestAnimationFrame(stepAnim);
  });

  wireInput(el("resetBtn"), "click", () => {
    stopAnim();
    robot = { x: -4.0, y: -3.0, theta: 0 };
    ball = { x: 0.0, y: 0.0 };
    robot.theta = Math.atan2(ball.y - robot.y, ball.x - robot.x);
    params.dist = 0.38; params.actDist = 1.5; params.orientTolDeg = 60; params.frontConeDeg = 120;
    params.decayConst = 4.0; params.lookahead = 0.3;
    syncInputsFromState(); render();
  });

  syncInputsFromState();
  render();

  return () => {
    stopAnim();
    cleanupFns.forEach((fn) => fn());
  };
}

export default function LongRangePreview() {
  const rootRef = useRef(null);

  useEffect(() => {
    document.title = "Long-Range Curve Preview — StrikerChase";
    if (!rootRef.current) return;
    const cleanup = initInteractive(rootRef.current);
    return cleanup;
  }, []);

  return (
    <>
      <Header />
      <div
        className="curve-preview-page"
        ref={rootRef}
        dangerouslySetInnerHTML={{ __html: CONTENT_HTML }}
      />
    </>
  );
}
