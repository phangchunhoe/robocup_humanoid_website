import { useEffect, useRef } from "react";
import Header from "../components/Header.jsx";
import "./GoalieExplorer.css";

const CONTENT_HTML = `
<div class="app">
  <header class="top">
    <span class="eyebrow">brain_tree.cpp · GoalieDecide / GoToGoalBlockingPosition / GoalieChase / GoalieZoneFindBall</span>
    <h1>Goalkeeper positioning explorer</h1>
    <p class="sub">
      Drag the ball anywhere on the field to see how the goalkeeper's <code>GoalieDecide</code> state
      machine reacts: when it holds its retreat/blocking line, when it chases the ball down, when it
      orbits to line up a clearance, and when it kicks — computed from the real spatial thresholds in
      <code>brain_tree.cpp</code> (box edges, danger zone, retreat pose), not an idealized version of
      them. Time-based rules (vision timers, confidence hysteresis, kick cooldowns) can't be shown on
      a single static snapshot — see the reference panel below for exactly what's simplified.
    </p>
  </header>

  <div class="controls-panel">
    <div class="control-row">
      <span class="control-label">Scenario</span>
      <label class="toggle-chip on" id="ballDetectedChip"><input type="checkbox" id="ballDetected" checked /> Ball currently detected</label>
      <label class="toggle-chip" id="doubleCoverageChip"><input type="checkbox" id="doubleCoverage" /> 2+ teammates already in our box</label>
    </div>
    <div class="control-row">
      <span class="hint">Drag the ball anywhere on the field. The dashed outline is our penalty area; the danger zone (near the goal, see console readout) has no separate outline but drives the CHASE-always rule below.</span>
    </div>
  </div>

  <div class="layout">
    <section class="panel field-panel">
      <div class="field-wrap">
        <svg id="field" viewBox="0 0 900 600" xmlns="http://www.w3.org/2000/svg">
          <g id="pitchStatic"></g>
          <rect id="ownBoxRect" class="own-box-rect"></rect>
          <line id="retreatLine" class="retreat-line"></line>
          <text id="retreatLineLabel" class="goal-label" text-anchor="middle">retreat line x=-6.5</text>
          <line id="kickDirLine" stroke="var(--accent)" stroke-width="2" stroke-dasharray="5 4" style="display:none"></line>
          <circle id="kickDirDot" r="4" fill="var(--accent)" style="display:none"></circle>

          <g id="goalieGroup">
            <circle id="goalieSpinRing" class="spin-ring" r="22" style="display:none"></circle>
            <line id="goalieHeading" stroke-width="3"></line>
            <circle id="goalieHandle" r="13"></circle>
            <text class="role-label" y="-22" text-anchor="middle">GK</text>
          </g>
          <g id="ballGroup">
            <circle id="ballHandle" r="9"></circle>
            <text class="label" y="-14" text-anchor="middle">BALL</text>
          </g>
        </svg>
      </div>
      <div class="legend">
        <span><i class="dot" style="background:var(--goalie)"></i>Goalkeeper</span>
        <span><i class="dot" style="background:var(--ball-fill);border:1px solid var(--ball-stroke)"></i>Ball (drag me)</span>
        <span><i class="dot" style="background:var(--accent)"></i>Intended clearance direction</span>
        <span><i class="dot" style="background:transparent;border:2px dashed var(--goalie)"></i>Our penalty area</span>
      </div>
      <p class="hint" style="padding:0 4px;">
        Field drawn to FD_ADULTSIZE (types.h): 14&times;9 m. Our goal is fixed at x = -7
        (goal_center_x in config_local.yaml); our penalty area spans x &isin; [-7, -4],
        y &isin; [-3, 3] (penaltyAreaLength = 3 m, penaltyAreaWidth = 6 m). The keeper is never
        allowed to chase past x = -4 even to clear the ball.
      </p>
    </section>

    <aside class="panel console">
      <div class="scenario-pill" id="statePill">&mdash;</div>
      <div class="role-stack">
        <div class="role-card goalie">
          <span class="role-name">Goalkeeper decision</span>
          <span class="role-pose" id="goaliePose">&mdash;</span>
          <span class="role-branch" id="goalieBranch">&mdash;</span>
          <span class="role-cite" id="goalieCite">&mdash;</span>
        </div>
      </div>
      <table class="const-table" id="readoutTable">
        <tr><th>Signal</th><th>Value</th></tr>
        <tr><td>Ball inside our box?</td><td id="rInBox">&mdash;</td></tr>
        <tr><td>In danger zone?</td><td id="rDanger">&mdash;</td></tr>
        <tr><td>Range from retreat line</td><td id="rRange">&mdash;</td></tr>
        <tr><td>Clearance direction</td><td id="rKickDir">&mdash;</td></tr>
        <tr><td>Aligned to clear?</td><td id="rAligned">&mdash;</td></tr>
      </table>
    </aside>
  </div>

  <details class="formula-ref">
    <summary>Formula &amp; constants reference</summary>
    <div class="ref-body">
      <p>
        Positions above come from <code>GoalieDecide::tick()</code> and its helpers, ported from
        <code>brain_tree.cpp</code>. The real node is a continuously-ticking state machine with
        timers, vision-confidence hysteresis, and debounce guards; this tool evaluates the same
        spatial rules on a single static ball position, so it shows what the goalkeeper would
        settle into given time to react &mdash; not tick-by-tick behaviour.
      </p>
      <h4>Field &amp; box constants (FD_ADULTSIZE, types.h / config_local.yaml)</h4>
      <table class="const-table">
        <tr><th>Constant</th><th>Value</th><th>Meaning</th></tr>
        <tr><td>length / width</td><td>14 m / 9 m</td><td>half-length 7, half-width 4.5</td></tr>
        <tr><td>goal_center_x</td><td>-7</td><td>our goal; opponent goal at +7</td></tr>
        <tr><td>goalWidth</td><td>2.6 m</td><td>goal mouth / retreat-pose y-clamp (&plusmn;1.3 + 0.3 margin)</td></tr>
        <tr><td>penalty_x_limit</td><td>-4.0</td><td>own box edge &mdash; keeper never chases past this</td></tr>
        <tr><td>penaltyAreaWidth</td><td>6 m</td><td>own box y-limit: &plusmn;3.0</td></tr>
        <tr><td>goalAreaWidth</td><td>4 m</td><td>danger-zone y-half-width: &plusmn;2.0</td></tr>
        <tr><td>retreat_line_offset</td><td>0.5 m</td><td>retreat line x = -6.5</td></tr>
        <tr><td>danger-zone depth</td><td>0.8 m</td><td>x &le; -6.2 (GoalieDecide inline check, brain_tree.cpp:7295-7298)</td></tr>
      </table>
      <h4>Goalkeeper retreat / blocking pose (default holding position)</h4>
      <pre class="code-block">x = -6.5                                    // goalieRetreatLineX, brain_tree.cpp:1350
y = clamp(ball.y * (x - goalX) / (ball.x - goalX), +-(goalWidth/2 + 0.3))
theta = atan2(ball.y - y, ball.x - x), capped to +-90 deg from straight-out
// calcGoalieRetreatPose, brain_tree.cpp:1363-1388</pre>
      <h4>Clearance direction (calcGoalieClearDir, brain_tree.cpp:1331-1344, simplified)</h4>
      <pre class="code-block">default: aim at opponent goal centre, atan2(0 - ball.y, 7 - ball.x)
in the danger zone:
  if ball has snuck behind the retreat line (own-goal risk) -> kick laterally (+-90 deg, ball's side)
  else                                                        -> snap to straight-forward (0 rad)</pre>
      <h4>Decision thresholds (subtree_goal_keeper_play.xml GoalieDecide/GoalieChase attributes)</h4>
      <pre class="code-block">chase_threshold        = 3.0   // far-approach engagement distance
adjust_angle_tolerance = 0.18 rad  // clearance-direction alignment gate
adjust_y_tolerance     = 0.08 m
GoalieChase dist       = 0.22 m    // final stand-off once aligned (kick/adjust pose)
GoalieChase safe_dist  = 0.45 m    // stand-off while still closing in (chase pose)</pre>
      <p>
        <strong>Rule set:</strong> ball outside our box (x &gt; -4, or |y| &gt; 3) &rarr; always
        <em>retreat</em> to the blocking pose, no exceptions. Ball inside the box and within the
        danger zone &rarr; always <em>chase</em> straight at the ball, never orbit. Ball inside the
        box, not in the danger zone, &gt;0.8 m from the retreat line &rarr; <em>chase</em>. Within
        0.8 m and aligned with the clearance direction (&plusmn;0.18 rad) &rarr; <em>kick</em>;
        otherwise <em>adjust</em> (orbit to line up the shot). If 2+ teammates already hold the box
        and the ball isn't urgent, <code>defensiveLockGoal</code> forces a retreat instead of also
        converging on the ball. If the ball isn't detected, the keeper spin-searches
        (<code>find</code>) when its last known spot was inside the box, or force-retreats when it
        was outside &mdash; it never wanders far from goal to search blind.
      </p>
      <p>
        <strong>What this tool omits</strong> (all real, all stateful/time-based, none
        representable on a static ball position): the 45 s panorama-sweep watchdog, 10 s
        stale-flank / 2 s stale-find timeouts, 4 s no-real-vision downgrade, 800 ms kick cooldown
        and 1500 ms kick/blind-kick latches, the 0.10&ndash;0.75 m box-edge hysteresis band (wider
        while chasing with high ball confidence, &ge;50), the 150 ms anti-flicker dwell timer, and
        the fact that <code>ballRange</code> in the real node is measured from the robot's actual
        (drifting) position, not always the idle retreat pose used here. There is also no dive
        motion anywhere in the codebase &mdash; "blocking" is pure body positioning and "clearing"
        is a walk-up kick (<code>kickType == "block"</code>).
      </p>
    </div>
  </details>
</div>
`;

function initInteractive(root) {
  const PXPM = 60;
  const toSvg = (x, y) => [(x + 7.5) * PXPM, (5 - y) * PXPM];
  const toField = (sx, sy) => [sx / PXPM - 7.5, 5 - sy / PXPM];
  const deg = (r) => (r * 180) / Math.PI;
  const cap = (v, hi, lo) => Math.min(hi, Math.max(lo, v));
  const hyp = (dx, dy) => Math.hypot(dx, dy);
  const angDiff = (a, b) => {
    let d = a - b;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return d;
  };

  const FD = {
    length: 14, width: 9, goalWidth: 2.6, penaltyAreaLength: 3, penaltyAreaWidth: 6,
    goalAreaLength: 1, goalAreaWidth: 4, circleRadius: 1.5, penaltyDist: 2.1,
  };
  const OUR_GOAL_X = -7;
  const OPP_GOAL_X = 7;
  const RETREAT_X = -6.5;
  const PENALTY_X_LIMIT = -4;
  const PENALTY_Y_LIMIT = FD.penaltyAreaWidth / 2; // 3.0
  const DANGER_X_DEPTH = 0.8;
  const DANGER_Y_HALF = FD.goalAreaWidth / 2; // 2.0
  const ADJUST_RANGE = 0.8;
  const ALIGN_TOLERANCE = 0.18;
  const CHASE_STANDOFF = 0.45; // GoalieChase safe_dist
  const KICK_STANDOFF = 0.22; // GoalieChase dist

  function calcGoalieRetreatPose(ball) {
    const x = RETREAT_X;
    const denom = ball.x - OUR_GOAL_X;
    const lineY = Math.abs(denom) > 1e-3 ? (ball.y * (x - OUR_GOAL_X)) / denom : 0;
    const maxAbsY = FD.goalWidth / 2 + 0.3;
    const y = cap(lineY, maxAbsY, -maxAbsY);
    const theta = cap(Math.atan2(ball.y - y, ball.x - x), Math.PI / 2, -Math.PI / 2);
    return { x, y, theta };
  }

  function approachPose(from, to, standoff) {
    const bearing = Math.atan2(to.y - from.y, to.x - from.x);
    return {
      x: to.x - standoff * Math.cos(bearing),
      y: to.y - standoff * Math.sin(bearing),
      theta: bearing,
    };
  }

  function clearancePose(ball, kickDir, standoff) {
    return {
      x: ball.x - standoff * Math.cos(kickDir),
      y: ball.y - standoff * Math.sin(kickDir),
      theta: kickDir,
    };
  }

  function computeGoalieState(ball, opts) {
    const retreatPose = calcGoalieRetreatPose(ball);
    const ballOutsideX = ball.x > PENALTY_X_LIMIT;
    const ballOutsideY = Math.abs(ball.y) > PENALTY_Y_LIMIT;
    const ballOutsideBox = ballOutsideX || ballOutsideY;
    const inDangerZone = !ballOutsideBox && ball.x <= OUR_GOAL_X + DANGER_X_DEPTH && Math.abs(ball.y) <= DANGER_Y_HALF;
    const ballBehindRetreatLine = ball.x < RETREAT_X;
    const kickDir = inDangerZone
      ? (ballBehindRetreatLine ? (ball.y >= 0 ? Math.PI / 2 : -Math.PI / 2) : 0)
      : Math.atan2(0 - ball.y, OPP_GOAL_X - ball.x);
    const range = hyp(ball.x - retreatPose.x, ball.y - retreatPose.y);
    const approachBearing = Math.atan2(ball.y - retreatPose.y, ball.x - retreatPose.x);
    const aligned = Math.abs(angDiff(kickDir, approachBearing)) < ALIGN_TOLERANCE;

    const base = { ball, retreatPose, ballOutsideBox, inDangerZone, range, kickDir, aligned };

    if (!opts.ballDetected) {
      if (ballOutsideBox) {
        return {
          ...base, decision: "retreat", pose: retreatPose,
          branch: "No current ball detection, and the ball's last known spot was outside our box — force retreat to a freshly computed blocking pose rather than spin-searching far from goal.",
          cite: "GoalieDecide stale-vision fallback, brain_tree.cpp:6993-7752",
        };
      }
      return {
        ...base, decision: "find", pose: retreatPose, spinning: true,
        branch: "No current ball detection, last known spot was inside our box — spin 360° in place sweeping the head, then fall back to the retreat pose if nothing turns up.",
        cite: "GoalieZoneFindBall, brain_tree.cpp:9668-9860",
      };
    }

    if (ballOutsideBox) {
      return {
        ...base, decision: "retreat", pose: retreatPose,
        branch: `Ball is outside our penalty area (${ballOutsideX ? `x=${ball.x.toFixed(2)} is upfield of the -4.0 box edge` : `|y|=${Math.abs(ball.y).toFixed(2)} is beyond the ±3.0 box edge`}) — the keeper is never allowed to chase out here (0.10–0.75 m hysteresis omitted). Holds the retreat/blocking pose instead.`,
        cite: "GoalieDecide own-box spatial guard, brain_tree.cpp:6993-7752",
      };
    }

    if (opts.doubleCoverage && !inDangerZone && range > ADJUST_RANGE) {
      return {
        ...base, decision: "retreat", pose: retreatPose,
        branch: "2+ teammates already inside our box and the ball isn't urgent (>0.8 m away, not in the danger zone) — defensiveLockGoal holds the keeper on the line instead of also converging on the ball.",
        cite: "GoalieDecide defensiveLockGoal, brain_tree.cpp:6993-7752",
      };
    }

    if (inDangerZone) {
      const pose = approachPose(retreatPose, ball, CHASE_STANDOFF);
      return {
        ...base, decision: "chase", pose,
        branch: `Ball is in the danger zone (within 0.8 m of the goal line and |y| < 2.0 m) — always chase straight at the ball, no orbiting. Clearance aimed ${ballBehindRetreatLine ? "laterally (kicking straight back risks an own goal)" : "straight forward"}.`,
        cite: "GoalieDecide danger-zone override + GoalieChase bypass, brain_tree.cpp:883-953, 7295-7298",
      };
    }

    if (range > ADJUST_RANGE) {
      const pose = approachPose(retreatPose, ball, CHASE_STANDOFF);
      return {
        ...base, decision: "chase", pose,
        branch: `Ball is ${range.toFixed(2)} m from the retreat line (> 0.8 m) — walk up to it before attempting to clear.`,
        cite: "GoalieDecide chase branch, brain_tree.cpp:6993-7752",
      };
    }

    const pose = clearancePose(ball, kickDir, KICK_STANDOFF);
    if (aligned) {
      return {
        ...base, decision: "kick", pose,
        branch: "Within 0.8 m of the retreat line and aligned with the clearance direction (±0.18 rad) — kick now.",
        cite: "GoalieDecide kick-readiness gate (canClearNow), brain_tree.cpp:6993-7752",
      };
    }
    return {
      ...base, decision: "adjust", pose,
      branch: "Within 0.8 m but not yet aligned with the clearance direction — orbit the ball to line up the kick.",
      cite: "Adjust node (goalie-tuned), subtree_goal_keeper_play.xml; adjust_angle_tolerance=0.18 rad",
    };
  }

  // ---- shared state ----
  const state = {
    ball: { x: 0, y: 0 },
    ballDetected: true,
    doubleCoverage: false,
  };

  // ---- DOM / rendering ----
  const svg = root.querySelector("#field");
  const el = (id) => root.querySelector("#" + id);
  const ns = "http://www.w3.org/2000/svg";

  function buildPitch() {
    const g = el("pitchStatic");
    const line = (x1, y1, x2, y2, w) => {
      const [sx1, sy1] = toSvg(x1, y1), [sx2, sy2] = toSvg(x2, y2);
      const l = document.createElementNS(ns, "line");
      l.setAttribute("x1", sx1); l.setAttribute("y1", sy1);
      l.setAttribute("x2", sx2); l.setAttribute("y2", sy2);
      l.setAttribute("stroke", "var(--turf-line)"); l.setAttribute("stroke-width", w || 2);
      g.appendChild(l);
    };
    const circle = (cx, cy, r) => {
      const [sx, sy] = toSvg(cx, cy);
      const c = document.createElementNS(ns, "circle");
      c.setAttribute("cx", sx); c.setAttribute("cy", sy); c.setAttribute("r", r * PXPM);
      c.setAttribute("fill", "none"); c.setAttribute("stroke", "var(--turf-line)"); c.setAttribute("stroke-width", 2);
      g.appendChild(c);
    };
    const text = (x, y, str, cls) => {
      const [sx, sy] = toSvg(x, y);
      const t = document.createElementNS(ns, "text");
      t.setAttribute("x", sx); t.setAttribute("y", sy);
      t.setAttribute("text-anchor", "middle");
      t.setAttribute("class", cls || "goal-label");
      t.textContent = str;
      g.appendChild(t);
    };
    const hl = FD.length / 2, hw = FD.width / 2;
    line(-hl, -hw, hl, -hw, 2.5); line(-hl, hw, hl, hw, 2.5);
    line(-hl, -hw, -hl, hw, 2.5); line(hl, -hw, hl, hw, 2.5);
    line(0, -hw, 0, hw, 2);
    circle(0, 0, FD.circleRadius);
    for (const side of [-1, 1]) {
      const px = side * hl;
      const pL = FD.penaltyAreaLength, pW = FD.penaltyAreaWidth / 2;
      line(px - side * pL, -pW, px - side * pL, pW, 2);
      line(px - side * pL, -pW, px, -pW, 2);
      line(px - side * pL, pW, px, pW, 2);
      const gL = FD.goalAreaLength, gW = FD.goalAreaWidth / 2;
      line(px - side * gL, -gW, px - side * gL, gW, 2);
      line(px - side * gL, -gW, px, -gW, 2);
      line(px - side * gL, gW, px, gW, 2);
      line(px, -FD.goalWidth / 2, px, FD.goalWidth / 2, 6);
    }
    text(OUR_GOAL_X + 1.3, hw - 0.35, "OUR GOAL");
    text(OPP_GOAL_X - 1.7, hw - 0.35, "OPPONENT GOAL");
  }

  function buildOverlays() {
    const ownBox = el("ownBoxRect");
    const [bx0, by0] = toSvg(OUR_GOAL_X, PENALTY_Y_LIMIT);
    ownBox.setAttribute("x", bx0); ownBox.setAttribute("y", by0);
    ownBox.setAttribute("width", (PENALTY_X_LIMIT - OUR_GOAL_X) * PXPM);
    ownBox.setAttribute("height", (2 * PENALTY_Y_LIMIT) * PXPM);

    const rl = el("retreatLine");
    const [rx1, ry1] = toSvg(RETREAT_X, -PENALTY_Y_LIMIT - 0.3);
    const [rx2, ry2] = toSvg(RETREAT_X, PENALTY_Y_LIMIT + 0.3);
    rl.setAttribute("x1", rx1); rl.setAttribute("y1", ry1);
    rl.setAttribute("x2", rx2); rl.setAttribute("y2", ry2);

    const lbl = el("retreatLineLabel");
    const [lx, ly] = toSvg(RETREAT_X, PENALTY_Y_LIMIT + 0.55);
    lbl.setAttribute("x", lx); lbl.setAttribute("y", ly);
  }

  buildPitch();
  buildOverlays();

  const $ballGroup = el("ballGroup"), $ballHandle = el("ballHandle");
  const $kickDirLine = el("kickDirLine"), $kickDirDot = el("kickDirDot");
  const $goalieGroup = el("goalieGroup"), $goalieHandle = el("goalieHandle"), $goalieHeading = el("goalieHeading"), $goalieSpinRing = el("goalieSpinRing");

  $ballHandle.setAttribute("fill", "var(--ball-fill)"); $ballHandle.setAttribute("stroke", "var(--ball-stroke)"); $ballHandle.setAttribute("stroke-width", 2);
  $goalieHandle.setAttribute("fill", "var(--goalie)"); $goalieHandle.setAttribute("stroke", "var(--panel)"); $goalieHandle.setAttribute("stroke-width", 2.5);
  $goalieHeading.setAttribute("stroke", "var(--goalie)");

  function positionGroup(group, heading, pose) {
    const [sx, sy] = toSvg(pose.x, pose.y);
    group.setAttribute("transform", `translate(${sx}, ${sy})`);
    if (heading) {
      const hlen = 26;
      const hx = hlen * Math.cos(pose.theta), hy = -hlen * Math.sin(pose.theta);
      heading.setAttribute("x1", 0); heading.setAttribute("y1", 0);
      heading.setAttribute("x2", hx); heading.setAttribute("y2", hy);
    }
  }

  function render() {
    const s = computeGoalieState(state.ball, { ballDetected: state.ballDetected, doubleCoverage: state.doubleCoverage });

    const [bsx, bsy] = toSvg(s.ball.x, s.ball.y);
    $ballGroup.setAttribute("transform", `translate(${bsx}, ${bsy})`);

    positionGroup($goalieGroup, s.spinning ? null : $goalieHeading, s.pose);
    $goalieHeading.style.display = s.spinning ? "none" : "block";
    $goalieSpinRing.style.display = s.spinning ? "block" : "none";

    el("goaliePose").textContent = `(${s.pose.x.toFixed(2)}, ${s.pose.y.toFixed(2)})${s.spinning ? " @ spinning" : ` @ ${deg(s.pose.theta).toFixed(0)}°`}`;
    el("goalieBranch").textContent = s.branch;
    el("goalieCite").textContent = s.cite;

    if (!s.spinning && (s.decision === "kick" || s.decision === "adjust" || s.decision === "chase")) {
      const from = s.ball;
      const to = { x: s.ball.x + 2.2 * Math.cos(s.kickDir), y: s.ball.y + 2.2 * Math.sin(s.kickDir) };
      const [fx, fy] = toSvg(from.x, from.y);
      const [tx, ty] = toSvg(to.x, to.y);
      $kickDirLine.setAttribute("x1", fx); $kickDirLine.setAttribute("y1", fy);
      $kickDirLine.setAttribute("x2", tx); $kickDirLine.setAttribute("y2", ty);
      $kickDirDot.setAttribute("cx", tx); $kickDirDot.setAttribute("cy", ty);
      $kickDirLine.style.display = "block"; $kickDirDot.style.display = "block";
    } else {
      $kickDirLine.style.display = "none"; $kickDirDot.style.display = "none";
    }

    const pill = el("statePill");
    pill.className = "scenario-pill state-" + s.decision;
    const subline = s.ballOutsideBox
      ? "ball outside our box"
      : s.inDangerZone
      ? "ball in the danger zone"
      : `ball inside box, ${s.range.toFixed(2)} m from retreat line`;
    pill.innerHTML = `${s.decision.toUpperCase()}<span class="zone-line">${subline}</span>`;

    el("rInBox").textContent = s.ballOutsideBox ? "No (outside)" : "Yes";
    el("rDanger").textContent = s.inDangerZone ? "Yes" : "No";
    el("rRange").textContent = `${s.range.toFixed(2)} m`;
    el("rKickDir").textContent = `${deg(s.kickDir).toFixed(0)}°`;
    el("rAligned").textContent = s.ballOutsideBox ? "n/a" : s.aligned ? "Yes" : "No";
  }

  // ---- ball drag ----
  function clientToField(evt) {
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX; pt.y = evt.clientY;
    const m = svg.getScreenCTM().inverse();
    const p = pt.matrixTransform(m);
    return toField(p.x, p.y);
  }
  const cleanupFns = [];
  function makeDraggable(handleEl, onMove) {
    const down = (evt) => {
      evt.preventDefault();
      handleEl.setPointerCapture(evt.pointerId);
      const move = (e) => { onMove(clientToField(e)); render(); };
      const up = () => {
        handleEl.removeEventListener("pointermove", move);
        handleEl.removeEventListener("pointerup", up);
      };
      handleEl.addEventListener("pointermove", move);
      handleEl.addEventListener("pointerup", up);
    };
    handleEl.addEventListener("pointerdown", down);
    cleanupFns.push(() => handleEl.removeEventListener("pointerdown", down));
  }
  makeDraggable($ballHandle, ([fx, fy]) => {
    state.ball.x = cap(fx, FD.length / 2 - 0.1, -FD.length / 2 + 0.1);
    state.ball.y = cap(fy, FD.width / 2 - 0.1, -FD.width / 2 + 0.1);
  });

  // ---- checkboxes ----
  function wireCheckbox(id, chipId, onChange) {
    const input = el(id);
    const chip = el(chipId);
    const handler = () => {
      onChange(input.checked);
      chip.classList.toggle("on", input.checked);
      render();
    };
    input.addEventListener("change", handler);
    cleanupFns.push(() => input.removeEventListener("change", handler));
  }
  wireCheckbox("ballDetected", "ballDetectedChip", (v) => { state.ballDetected = v; });
  wireCheckbox("doubleCoverage", "doubleCoverageChip", (v) => { state.doubleCoverage = v; });

  render();

  return () => {
    cleanupFns.forEach((fn) => fn());
  };
}

export default function GoalieExplorer() {
  const rootRef = useRef(null);

  useEffect(() => {
    document.title = "Goalkeeper Positioning Explorer — Goalie Strategy";
    if (!rootRef.current) return;
    const cleanup = initInteractive(rootRef.current);
    return cleanup;
  }, []);

  return (
    <>
      <Header />
      <div
        className="goalie-explorer-page"
        ref={rootRef}
        dangerouslySetInnerHTML={{ __html: CONTENT_HTML }}
      />
    </>
  );
}
