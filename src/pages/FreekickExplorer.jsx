import { useEffect, useRef } from "react";
import Header from "../components/Header.jsx";
import "./FreekickExplorer.css";

const CONTENT_HTML = `
<div class="app">
  <header class="top">
    <span class="eyebrow">brain_tree.cpp · GoToFreekickPosition / SetXTarget / calcXPose</span>
    <h1>Set-piece position explorer</h1>
    <p class="sub">
      All 5 set pieces, both sides of the ball. Pick a set-piece type and whether we're taking it
      or receiving it, then move the ball (drag it, or use the corner/touchline picker for the
      set pieces where the rules pin it down) to see where the lead striker, assist striker, and
      goalkeeper actually go — computed straight from the position formulas in
      <code>brain_tree.cpp</code>, not idealized versions of them.
    </p>
  </header>

  <div class="controls-panel">
    <div class="control-row">
      <span class="control-label">Set piece</span>
      <div class="seg" id="typeSeg">
        <button type="button" data-type="direct" class="active">Direct Free Kick</button>
        <button type="button" data-type="indirect">Indirect Free Kick</button>
        <button type="button" data-type="throwin">Throw-In</button>
        <button type="button" data-type="goalkick">Goal Kick</button>
        <button type="button" data-type="corner">Corner Kick</button>
      </div>
    </div>
    <div class="control-row">
      <span class="control-label">Who's kicking</span>
      <div class="seg side" id="sideSeg">
        <button type="button" data-side="attack" class="active attack">We're taking it (attack)</button>
        <button type="button" data-side="defense" class="defense">We're receiving it (defense)</button>
      </div>
    </div>

    <div class="ball-controls">
      <div class="control-row" data-ball-ui="free">
        <span class="hint">Drag the ball anywhere on the field.</span>
      </div>
      <div class="control-row" data-ball-ui="throwin" style="display:none">
        <span class="control-label">Touchline</span>
        <div class="seg" id="touchlineSeg">
          <button type="button" data-touchline="top" class="active">Top (y = +4.5)</button>
          <button type="button" data-touchline="bottom">Bottom (y = -4.5)</button>
        </div>
        <span class="hint">Rule: throw-in ball always sits at y = &plusmn;4.5. Drag left/right along the line.</span>
      </div>
      <div class="control-row" data-ball-ui="corner" style="display:none">
        <span class="control-label">Which corner</span>
        <div class="seg" id="cornerSeg">
          <button type="button" data-corner="pos" class="active">+y corner</button>
          <button type="button" data-corner="neg">-y corner</button>
        </div>
        <span class="hint">Rule: corner-kick ball only ever sits at one of the 2 real corner points.</span>
      </div>
      <div class="control-row" data-ball-ui="goalkick" style="display:none">
        <span class="control-label">Ball spot</span>
        <div class="seg" id="goalkickCornerSeg">
          <button type="button" data-gkcorner="pos" class="active">J — front-left (+y)</button>
          <button type="button" data-gkcorner="neg">K — front-right (-y)</button>
        </div>
        <span class="hint">Rule: goal-kick ball snaps to one of the 2 front corners of the goal-area box.</span>
      </div>
      <div class="control-row" id="laneToggles" data-ball-ui="lanes" style="display:none">
        <span class="control-label">Lanes clear?</span>
        <label class="toggle-chip on"><input type="checkbox" id="laneTop" checked /> Top (1,4,7)</label>
        <label class="toggle-chip on"><input type="checkbox" id="laneCentre" checked /> Centre (2,5,8)</label>
        <label class="toggle-chip on"><input type="checkbox" id="laneBottom" checked /> Bottom (3,6,9)</label>
        <span class="hint">Drives which lane the goalkeeper (taker) clears into.</span>
      </div>
    </div>
  </div>

  <div class="layout">
    <section class="panel field-panel">
      <div class="field-wrap">
        <svg id="field" viewBox="0 0 900 600" xmlns="http://www.w3.org/2000/svg">
          <g id="pitchStatic"></g>
          <g id="zoneGrid"></g>
          <rect id="activeZoneRect" fill="rgba(217,127,44,0.14)" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="4 3" style="display:none"></rect>
          <line id="kickDirLine" stroke="var(--accent)" stroke-width="2" stroke-dasharray="5 4" style="display:none"></line>
          <circle id="kickDirDot" r="4" fill="var(--accent)" style="display:none"></circle>

          <g id="goalieGroup">
            <line id="goalieHeading" stroke-width="3"></line>
            <circle id="goalieHandle" r="12"></circle>
            <text class="role-label" y="-18" text-anchor="middle">GK</text>
          </g>
          <g id="assistGroup">
            <line id="assistHeading" stroke-width="3"></line>
            <circle id="assistHandle" r="12"></circle>
            <text class="role-label" y="-18" text-anchor="middle">ASSIST</text>
          </g>
          <g id="leadGroup">
            <line id="leadHeading" stroke-width="3"></line>
            <circle id="leadHandle" r="12"></circle>
            <text class="role-label" y="-18" text-anchor="middle">LEAD</text>
          </g>
          <g id="ballGroup">
            <circle id="ballHandle" r="9"></circle>
            <text class="label" y="-14" text-anchor="middle">BALL</text>
          </g>
        </svg>
      </div>
      <div class="legend">
        <span><i class="dot" style="background:var(--lead)"></i>Lead (striker rank 0 — the taker)</span>
        <span><i class="dot" style="background:var(--assist)"></i>Assist (striker rank 1)</span>
        <span><i class="dot" style="background:var(--goalie)"></i>Goalkeeper</span>
        <span><i class="dot" style="background:var(--ball-fill);border:1px solid var(--ball-stroke)"></i>Ball</span>
        <span><i class="dot" style="background:var(--accent)"></i>Intended kick direction</span>
      </div>
      <p class="hint" style="padding:0 4px;">
        Field drawn to FD_ADULTSIZE (types.h): 14&times;9 m. Our goal is fixed at x = -7 (goal_center_x
        in config_local.yaml); the opponent's goal is at x = +7. The 3&times;3 zone grid (zoneCenterPoint /
        fieldZoneForPoint, brain_tree.cpp:92-162) is what every branch below keys off of.
      </p>
    </section>

    <aside class="panel console">
      <div class="scenario-pill" id="scenarioPill">—</div>
      <div class="role-stack">
        <div class="role-card lead">
          <span class="role-name">Lead</span>
          <span class="role-pose" id="leadPose">—</span>
          <span class="role-branch" id="leadBranch">—</span>
          <span class="role-cite" id="leadCite">—</span>
        </div>
        <div class="role-card assist">
          <span class="role-name">Assist</span>
          <span class="role-pose" id="assistPose">—</span>
          <span class="role-branch" id="assistBranch">—</span>
          <span class="role-cite" id="assistCite">—</span>
        </div>
        <div class="role-card goalie">
          <span class="role-name">Goalkeeper</span>
          <span class="role-pose" id="goaliePose">—</span>
          <span class="role-branch" id="goalieBranch">—</span>
          <span class="role-cite" id="goalieCite">—</span>
        </div>
      </div>
    </aside>
  </div>

  <details class="formula-ref">
    <summary>Formula &amp; constants reference</summary>
    <div class="ref-body">
      <p>
        Every position on the field above comes from one of the functions below, ported 1:1 from
        <code>brain_tree.cpp</code>. <code>kickDir</code> is simplified to a straight
        atan2(target &minus; ball) throughout, the same simplification the Long-Range Curve Preview
        artifact already documents for <code>CalcKickDir</code> (the real version also nudges the
        angle off goalpost/obstruction margins).
      </p>
      <h4>Field constants (FD_ADULTSIZE, types.h)</h4>
      <table class="const-table">
        <tr><th>Constant</th><th>Value</th><th>Meaning</th></tr>
        <tr><td>length / width</td><td>14 m / 9 m</td><td>half-length 7, half-width 4.5</td></tr>
        <tr><td>goal_center_x</td><td>-7</td><td>our goal; opponent goal at +7</td></tr>
        <tr><td>goalWidth</td><td>2.6 m</td><td>goalie's y-clamp on the retreat line</td></tr>
        <tr><td>goalAreaLength / Width</td><td>1 m / 4 m</td><td>goal-kick corner spots J/K = (&plusmn;6, &plusmn;2)</td></tr>
        <tr><td>penaltyDist</td><td>2.1 m</td><td>own penalty mark = -4.9</td></tr>
        <tr><td>retreat_line_offset</td><td>0.5 m</td><td>goalie retreat line x = -6.5</td></tr>
        <tr><td>attack_dist</td><td>0.7 m</td><td>taker's stand-off behind the ball</td></tr>
      </table>
      <h4>Attacking taker (lead, or goalkeeper for a goal kick)</h4>
      <pre class="code-block">target = ball - 0.7 * (cos(kickDir), sin(kickDir)),  facing kickDir
// GoToFreekickPosition side="attack" rank 0, brain_tree.cpp:2398-2401</pre>
      <h4>Assist fallback (no dedicated receive zone for this ball position)</h4>
      <pre class="code-block">defenseDir = atan2(ball.y, ball.x + 7)                 // direction from OUR goal to the ball
target = ball - 2.0 * (cos(defenseDir), sin(defenseDir)), facing defenseDir
// GoToFreekickPosition side="attack" rank 1, brain_tree.cpp:2402-2405</pre>
      <h4>Goalkeeper retreat / blocking pose (used in 9 of the 10 scenarios)</h4>
      <pre class="code-block">x = -6.5                                    // goalieRetreatLineX, brain_tree.cpp:1350
y = clamp(ball.y * (x - goalX) / (ball.x - goalX), +-(goalWidth/2 + 0.3))
theta = atan2(ball.y - y, ball.x - x), capped to +-90 deg from straight-out
// calcGoalieRetreatPose, brain_tree.cpp:1363-1388</pre>
      <h4>Defensive lead striker — line-blocking geometry (throw-in / free kick / goal kick)</h4>
      <pre class="code-block">u = unit vector from ball toward our goal (or own penalty mark, for corner kick)
d  = standoff distance from ball along that line, clamped to never cross the goal line:
       throw-in / free kick:  d = 0.10 * L + 2.0        (calcDefensiveThrowInLeadPose)
       corner kick:           d = min(1.7, L)            (calcDefensiveCornerLeadPose)
       goal kick:             d = 3.0                    (calcDefensiveGoalKickLeadPose)
target = ball + d * u,  facing the ball</pre>
      <h4>Defensive assist (2nd striker) — throw-in / free kick only</h4>
      <pre class="code-block">bisector of (+x axis) and (goal -&gt; ball direction); stand at 50% of that line's length
from the goal, floored so it's never closer than 1.5 m to the ball
// calcDefensiveThrowInSecondPose, brain_tree.cpp:1738-1778</pre>
      <p>
        <strong>Direct vs. indirect asymmetry:</strong> both only run a hard clearance (aimed at
        zone 8 centre) when the ball is in our own defensive third (zones 1-3), and both fall back to
        a plain shot at goal otherwise since <code>electPassReceiver()</code> is a stub that always
        returns "no receiver" (<code>brain_tree.cpp:539-542</code>) — there is genuinely no pass
        coordination implemented. The difference is in the <em>assist's</em> positioning: direct free
        kick only pre-positions a forward receive spot for zones 4-6 (falling back to the generic
        "2 m behind the ball" pose for zones 1-3 and 7-9); indirect free kick extends that forward
        positioning to zones 4-9, since scoring directly off an indirect kick is illegal anyway so
        there's more reason to hold a supporting position deep in the attacking third.
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

  const FD = {
    length: 14, width: 9, goalWidth: 2.6, penaltyAreaLength: 3, penaltyAreaWidth: 6,
    goalAreaLength: 1, goalAreaWidth: 4, circleRadius: 1.5, penaltyDist: 2.1,
  };
  const OUR_GOAL_X = -7;
  const OPP_GOAL_X = 7;
  const RETREAT_X = -6.5;
  const ATTACK_DIST = 0.7;

  // ---- zone geometry (brain_tree.cpp:92-162) ----
  function zoneCenterPoint(zone) {
    const idx = zone - 1, col = Math.floor(idx / 3), rowFromTop = idx % 3;
    return {
      x: -FD.length / 2 + (FD.length * (col + 0.5)) / 3,
      y: FD.width / 2 - (FD.width * (rowFromTop + 0.5)) / 3,
    };
  }
  function zoneStartPoint(zone) {
    const idx = zone - 1, col = Math.floor(idx / 3), rowFromTop = idx % 3;
    return {
      x: -FD.length / 2 + (FD.length * col) / 3,
      y: FD.width / 2 - (FD.width * (rowFromTop + 0.5)) / 3,
    };
  }
  function fieldZoneForPoint(x, y) {
    const hl = FD.length / 2, hw = FD.width / 2;
    if (x < -hl || x > hl || y < -hw || y > hw) return 0;
    let col = Math.floor((x + hl) / (FD.length / 3));
    let rowFromBottom = Math.floor((y + hw) / (FD.width / 3));
    col = cap(col, 2, 0);
    rowFromBottom = cap(rowFromBottom, 2, 0);
    const rowFromTop = 2 - rowFromBottom;
    return col * 3 + rowFromTop + 1;
  }
  function zoneBand(zone) {
    if (zone >= 1 && zone <= 3) return "1_3";
    if (zone >= 4 && zone <= 6) return "4_6";
    if (zone >= 7 && zone <= 9) return "7_9";
    return "unknown";
  }
  function mapZoneToReceiveZone(zone) {
    const mapped = zone >= 4 && zone <= 6 ? zone + 3 : zone;
    if (mapped === 7) return 9;
    if (mapped === 9) return 7;
    return 9; // mapped === 8: tie-break default (no receiver electable), brain_tree.cpp:604-608
  }

  // ---- pose helpers ----
  function kickDirToward(from, to) {
    return Math.atan2(to.y - from.y, to.x - from.x);
  }
  function attackTakerPose(ball, kickDir) {
    return { x: ball.x - ATTACK_DIST * Math.cos(kickDir), y: ball.y - ATTACK_DIST * Math.sin(kickDir), theta: kickDir };
  }
  function assistFallbackPose(ball) {
    const defenseDir = Math.atan2(ball.y, ball.x + FD.length / 2);
    return { x: ball.x - 2.0 * Math.cos(defenseDir), y: ball.y - 2.0 * Math.sin(defenseDir), theta: defenseDir };
  }
  function calcReceiverBisectorTheta(target, ballSource) {
    const goal = { x: FD.length / 2, y: 0 };
    const ballDx = ballSource.x - target.x, ballDy = ballSource.y - target.y;
    const goalDx = goal.x - target.x, goalDy = goal.y - target.y;
    const ballNorm = hyp(ballDx, ballDy), goalNorm = hyp(goalDx, goalDy);
    if (ballNorm < 1e-6) return Math.atan2(goalDy, goalDx);
    if (goalNorm < 1e-6) return Math.atan2(ballDy, ballDx);
    const sumX = ballDx / ballNorm + goalDx / goalNorm, sumY = ballDy / ballNorm + goalDy / goalNorm;
    if (hyp(sumX, sumY) < 1e-6) return Math.atan2(ballDy, ballDx);
    return Math.atan2(sumY, sumX);
  }
  function calcGoalieRetreatPose(ball) {
    const x = RETREAT_X;
    const denom = ball.x - OUR_GOAL_X;
    const lineY = Math.abs(denom) > 1e-3 ? (ball.y * (x - OUR_GOAL_X)) / denom : 0;
    const maxAbsY = FD.goalWidth / 2 + 0.3;
    const y = cap(lineY, maxAbsY, -maxAbsY);
    const theta = cap(Math.atan2(ball.y - y, ball.x - x), Math.PI / 2, -Math.PI / 2);
    return { x, y, theta };
  }
  const OUR_GOAL_POINT = { x: OUR_GOAL_X, y: 0 };
  // Shared by both defensive lead-striker poses (throw-in/free-kick and goal-kick): stand on
  // the ball->own-goal line at a standoff distance, clamped short of the goal line.
  function calcDefensiveLinePose(ball, standoff) {
    const L = Math.max(hyp(ball.x - OUR_GOAL_X, ball.y), 1e-5);
    const ux = (OUR_GOAL_X - ball.x) / L, uy = (0 - ball.y) / L;
    const minGoalClearance = 0.2;
    const d = Math.min(standoff(L), Math.max(0, L - minGoalClearance));
    let x = ball.x + d * ux, y = ball.y + d * uy;
    x = Math.max(x, OUR_GOAL_X + minGoalClearance);
    const theta = Math.atan2(ball.y - y, ball.x - x);
    return { x, y, theta };
  }
  const calcDefensiveThrowInLeadPose = (ball) => calcDefensiveLinePose(ball, (L) => 0.1 * L + 2.0);
  const calcDefensiveGoalKickLeadPose = (ball) => calcDefensiveLinePose(ball, () => 3.0);
  function calcDefensiveCornerLeadPose(ball) {
    const mark = { x: OUR_GOAL_X + FD.penaltyDist, y: 0 };
    const L = Math.max(hyp(ball.x - mark.x, ball.y - mark.y), 1e-5);
    const ux = (mark.x - ball.x) / L, uy = (mark.y - ball.y) / L;
    const d = Math.min(1.7, L);
    const x = ball.x + d * ux, y = ball.y + d * uy;
    return { x, y, theta: Math.atan2(ball.y - y, ball.x - x) };
  }
  function calcDefensiveThrowInSecondPose(ball) {
    const goal = OUR_GOAL_POINT;
    const L = Math.max(hyp(ball.x - goal.x, ball.y - goal.y), 1e-5);
    const gbx = (ball.x - goal.x) / L, gby = (ball.y - goal.y) / L;
    const bis = Math.atan2(0 + gby, 1 + gbx);
    const ux = Math.cos(bis), uy = Math.sin(bis);
    let t = L / 2;
    const MIN_BALL_DIST = 1.5;
    const dDotU = (ball.x - goal.x) * ux + (ball.y - goal.y) * uy;
    const distAtHalf = Math.sqrt(Math.max(0, t * t - 2 * dDotU * t + L * L));
    if (distAtHalf < MIN_BALL_DIST) {
      const disc = dDotU * dDotU - (L * L - MIN_BALL_DIST * MIN_BALL_DIST);
      t = disc >= 0 ? Math.max(0, dDotU - Math.sqrt(disc)) : 0;
    }
    let x = goal.x + t * ux, y = goal.y + t * uy;
    x = Math.max(x, goal.x + 0.2);
    x = cap(x, FD.length / 2, -FD.length / 2);
    y = cap(y, FD.width / 2, -FD.width / 2);
    return { x, y, theta: Math.atan2(ball.y - y, ball.x - x) };
  }

  // ---- shared state ----
  const state = {
    type: "direct",
    side: "attack",
    ball: { x: 0, y: 0 },
    throwinX: 0,
    touchline: "top",
    cornerSide: "pos",
    gkCorner: "pos",
    lanes: { top: true, centre: true, bottom: true },
  };

  function getBallPos() {
    if (state.type === "throwin") {
      return { x: cap(state.throwinX, 6.8, -6.8), y: state.touchline === "top" ? 4.5 : -4.5 };
    }
    if (state.type === "corner") {
      return { x: state.side === "attack" ? OPP_GOAL_X : OUR_GOAL_X, y: state.cornerSide === "pos" ? 4.5 : -4.5 };
    }
    if (state.type === "goalkick") {
      const x = state.side === "attack" ? OUR_GOAL_X + FD.goalAreaLength : OPP_GOAL_X - FD.goalAreaLength;
      return { x, y: state.gkCorner === "pos" ? FD.goalAreaWidth / 2 : -FD.goalAreaWidth / 2 };
    }
    return state.ball;
  }

  function lanePick(lanes) {
    if (lanes.centre) return 8;
    if (lanes.top) return 7;
    if (lanes.bottom) return 9;
    return 8;
  }

  // ---- per-scenario computation ----
  function computeScenario() {
    const ball = getBallPos();
    const zone = fieldZoneForPoint(ball.x, ball.y);
    const band = zoneBand(zone);
    const attacking = state.side === "attack";
    let lead, assist, goalie, kickDirLine = null;
    let scenarioLabel = "";
    const oppGoal = { x: OPP_GOAL_X, y: 0 };

    const cite = (text) => text;

    if (state.type === "direct" || state.type === "indirect") {
      const isIndirect = state.type === "indirect";
      scenarioLabel = `${isIndirect ? "Indirect" : "Direct"} Free Kick — ${attacking ? "We take it" : "Opponent takes it"} — ball in zone ${zone} (band ${band})`;
      if (attacking) {
        let kickDir, leadBranch;
        if (band === "1_3") {
          const t = zoneCenterPoint(8);
          kickDir = kickDirToward(ball, t);
          leadBranch = `Ball in zone ${zone} (own defensive third) → hard clearance toward zone 8 centre (${t.x.toFixed(2)}, ${t.y.toFixed(2)})`;
        } else {
          kickDir = kickDirToward(ball, oppGoal);
          leadBranch = `Ball in zone ${zone} → no receiver available (electPassReceiver stub always returns none) → taker shoots straight at goal` + (isIndirect && band === "7_9" ? ". Zone 7-9 taker may alternatively DribbleToGoal instead of shooting (not shown as a separate marker)." : "");
        }
        lead = { ...attackTakerPose(ball, kickDir), branch: leadBranch, cite: cite(`SetDirectFreekickTarget / SetIndirectFreekickTarget, brain_tree.cpp:${isIndirect ? "4083" : "4709"}`) };
        kickDirLine = { from: ball, to: { x: ball.x + 3 * Math.cos(kickDir), y: ball.y + 3 * Math.sin(kickDir) } };

        const inReceiveRange = isIndirect ? zone >= 4 && zone <= 9 : zone >= 4 && zone <= 6;
        if (inReceiveRange) {
          const rz = mapZoneToReceiveZone(zone);
          const t = zoneStartPoint(rz);
          assist = { x: t.x, y: t.y, theta: calcReceiverBisectorTheta(t, ball), branch: `Ball zone ${zone} → maps to receive zone ${rz} → holds zoneStartPoint(${rz}), facing the ball/goal bisector`, cite: cite(`Handle${isIndirect ? "Pass" : "DirectFreekick"}Receiver, brain_tree.cpp:${isIndirect ? "4605" : "5802"}`) };
        } else {
          assist = { ...assistFallbackPose(ball), branch: `Ball zone ${zone} → ${isIndirect ? "only zones 1-3" : "zones 1-3 and 7-9"} have no dedicated receive spot here → falls back to the generic rank-1 pose: 2 m from the ball, toward our own goal`, cite: cite("GoToFreekickPosition side=\"attack\" rank 1, brain_tree.cpp:2402-2405") };
        }
      } else {
        lead = { ...calcDefensiveThrowInLeadPose(ball), branch: "On the ball→own-goal line, 10% of that line's length + 2 m from the ball, clamped short of the goal line", cite: cite("calcDefensiveThrowInLeadPose, brain_tree.cpp:1687-1707") };
        assist = { ...calcDefensiveThrowInSecondPose(ball), branch: "Off the line, on the bisector of the +x axis and the goal→ball direction, at the 50% mark (never closer than 1.5 m to the ball)", cite: cite("calcDefensiveThrowInSecondPose, brain_tree.cpp:1738-1778") };
      }
      goalie = { ...calcGoalieRetreatPose(ball), branch: "Holds the retreat/blocking line regardless of which side is taking the kick", cite: cite("calcGoalieRetreatPose, brain_tree.cpp:1363-1388") };
    } else if (state.type === "throwin") {
      scenarioLabel = `Throw-In — ${attacking ? "We take it" : "Opponent takes it"} — ball on the ${ball.y > 0 ? "top" : "bottom"} touchline, zone ${zone}`;
      if (attacking) {
        const aim = zoneCenterPoint(8);
        let kickDir = kickDirToward(ball, aim);
        const halfWid = FD.width / 2, SIDELINE_BAND = 0.5, MIN_INWARD_SIN = 0.26;
        let inwardSign = 0;
        if (ball.y < -halfWid + SIDELINE_BAND) inwardSign = 1;
        else if (ball.y > halfWid - SIDELINE_BAND) inwardSign = -1;
        let clamped = false;
        if (inwardSign !== 0) {
          let dx = Math.cos(kickDir), dy = Math.sin(kickDir);
          if (inwardSign * dy < MIN_INWARD_SIN) {
            clamped = true;
            dy = inwardSign * MIN_INWARD_SIN;
            const dxMag = Math.sqrt(Math.max(0, 1 - dy * dy));
            dx = (dx >= 0 ? 1 : -1) * dxMag;
            kickDir = Math.atan2(dy, dx);
          }
        }
        lead = { ...attackTakerPose(ball, kickDir), branch: `Aim is always zone 8 centre${clamped ? " — sideline inward clamp engaged (raw aim was too shallow, forced ≥ 15° back into the field)" : " — sideline clamp not needed here, raw aim already safely inward"}`, cite: cite("SetThrowInTarget, brain_tree.cpp:6114-6245") };
        kickDirLine = { from: ball, to: { x: ball.x + 3 * Math.cos(kickDir), y: ball.y + 3 * Math.sin(kickDir) } };

        const preZone = zone === 1 || zone === 3 ? 5 : 8;
        const classification = zone === 1 || zone === 3 || zone === 4 || zone === 6 ? "clearance" : "pass";
        const t = zoneCenterPoint(preZone);
        const theta = preZone === 5 ? kickDirToward(t, ball) : calcReceiverBisectorTheta(t, ball);
        assist = { x: t.x, y: t.y, theta, branch: `Original zone ${zone} → ${preZone === 5 ? "clearance collector at zone 5 centre, facing the ball source" : "cross receiver at zone 8 centre, facing the goal/ball bisector"} (taker's kick classified internally as "${classification}")`, cite: cite("HandleThrowInReceiver, brain_tree.cpp:6399-6494") };
      } else {
        lead = { ...calcDefensiveThrowInLeadPose(ball), branch: "Same line-blocking geometry as the defensive free-kick lead: 10% of ball→goal distance + 2 m from the ball", cite: cite("calcDefensiveThrowInLeadPose, brain_tree.cpp:1687-1707") };
        assist = { ...calcDefensiveThrowInSecondPose(ball), branch: "Same bisector-marking geometry as the defensive free-kick assist", cite: cite("calcDefensiveThrowInSecondPose, brain_tree.cpp:1738-1778") };
      }
      goalie = { ...calcGoalieRetreatPose(ball), branch: "Holds the retreat/blocking line — no throw-in-specific goalkeeper logic exists", cite: cite("calcGoalieRetreatPose, brain_tree.cpp:1363-1388") };
    } else if (state.type === "goalkick") {
      const cornerSign = ball.y > 0 ? 1 : -1;
      scenarioLabel = `Goal Kick — ${attacking ? "We take it" : "Opponent takes it"} — ball at ${attacking ? (cornerSign > 0 ? "J" : "K") : "opponent's mirrored corner"} (${ball.x.toFixed(1)}, ${ball.y.toFixed(1)})`;
      if (attacking) {
        const targetZone = lanePick(state.lanes);
        const aim = zoneCenterPoint(targetZone);
        const kickDir = kickDirToward(ball, aim);
        goalie = { ...attackTakerPose(ball, kickDir), branch: `Goalkeeper is the taker here. Lane pick: centre(2,5,8) ${state.lanes.centre ? "clear" : "blocked"} → ${state.lanes.centre ? "chosen" : "skip"}; top(1,4,7) ${state.lanes.top ? "clear" : "blocked"}; bottom(3,6,9) ${state.lanes.bottom ? "clear" : "blocked"} → target zone ${targetZone}`, cite: cite("SetGoalKickTarget, brain_tree.cpp:5475-5620") };
        kickDirLine = { from: ball, to: { x: ball.x + 3 * Math.cos(kickDir), y: ball.y + 3 * Math.sin(kickDir) } };
        const leadPos = { x: -3, y: cornerSign * 3 };
        lead = { ...leadPos, theta: kickDirToward(leadPos, ball), branch: `Lowest-rank striker → corner standby (-3, ${cornerSign > 0 ? "+" : "-"}3), sign matched to the ball's corner`, cite: cite("GoToGoalKickStandby, brain_tree.cpp:1499-1520") };
        const assistPos = { x: 0, y: 0 };
        assist = { ...assistPos, theta: kickDirToward(assistPos, ball), branch: "Any additional striker holds the field centre", cite: cite("GoToGoalKickStandby, brain_tree.cpp:1548-1551") };
      } else {
        lead = { ...calcDefensiveGoalKickLeadPose(ball), branch: "Ball position already established this goal kick → line-block 3 m from the ball toward our own goal (the corner-spot fallback only applies before the ball is ever seen)", cite: cite("calcDefensiveGoalKickLeadPose, brain_tree.cpp:1439-1459") };
        const assistPos = { x: 0, y: 0 };
        assist = { ...assistPos, theta: kickDirToward(assistPos, ball), branch: "Inferred symmetric to the attacking case (same GoToGoalKickStandby node, side=\"defense\") — holds field centre", cite: cite("GoToGoalKickStandby, brain_tree.cpp:1548-1551 (inferred)") };
        goalie = { ...calcGoalieRetreatPose(ball), branch: "Goalkeeper does not get involved in the opponent's goal kick — normal retreat/blocking pose", cite: cite("calcGoalieRetreatPose, brain_tree.cpp:1363-1388") };
      }
    } else if (state.type === "corner") {
      scenarioLabel = `Corner Kick — ${attacking ? "We take it" : "Opponent takes it"} — ball at (${ball.x.toFixed(1)}, ${ball.y.toFixed(1)})`;
      if (attacking) {
        const aim = zoneCenterPoint(8);
        const kickDir = kickDirToward(ball, aim);
        lead = { ...attackTakerPose(ball, kickDir), branch: "Always aims at zone 8 centre (CORNER_TARGET_ZONE) — taker first scans both corner waypoints (4,±3)→look(7,±4.5) before this applies", cite: cite("SetCornerKickTarget, brain_tree.cpp:5887-6021") };
        kickDirLine = { from: ball, to: { x: ball.x + 3 * Math.cos(kickDir), y: ball.y + 3 * Math.sin(kickDir) } };
        const t = zoneStartPoint(8);
        assist = { x: t.x, y: t.y, theta: calcReceiverBisectorTheta(t, ball), branch: "Always holds the start of zone 8 — no zone branching, since the ball is always at a fixed corner", cite: cite("HandleCornerKickReceiver, brain_tree.cpp:6023-6111") };
        goalie = { ...calcGoalieRetreatPose(ball), branch: "While the ball isn't yet confirmed, GoalieCornerScan sweeps the body between our two goal-line corners instead of translating", cite: cite("calcGoalieRetreatPose, brain_tree.cpp:1363-1388") };
      } else {
        lead = { ...calcDefensiveCornerLeadPose(ball), branch: "On the ball→own-penalty-mark line, 1.7 m standoff (clamped to never overshoot the mark). Frozen — zero velocity — whenever within 1.5 m of the ball, released again only past 1.8 m", cite: cite("calcDefensiveCornerLeadPose, brain_tree.cpp:1712-1731 + GoToFreekickPosition:2452-2467") };
        const assistPos = { x: OUR_GOAL_X + FD.penaltyDist, y: 0 };
        assist = { ...assistPos, theta: kickDirToward(assistPos, ball), branch: "Holds our own penalty mark (-4.9, 0), facing the ball", cite: cite("GoToFreekickPosition side=\"defense\" set_play=\"corner\" rank 1, brain_tree.cpp:2421-2427") };
        goalie = { ...calcGoalieRetreatPose(ball), branch: "Holds the retreat/blocking line", cite: cite("calcGoalieRetreatPose, brain_tree.cpp:1363-1388") };
      }
    }

    return { ball, zone, band, lead, assist, goalie, kickDirLine, scenarioLabel };
  }

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

  function buildZoneGrid() {
    const g = el("zoneGrid");
    const hl = FD.length / 2, hw = FD.width / 2;
    const colX = [-hl + FD.length / 3, -hl + (2 * FD.length) / 3];
    const rowY = [hw - FD.width / 3, hw - (2 * FD.width) / 3];
    const dashLine = (x1, y1, x2, y2) => {
      const [sx1, sy1] = toSvg(x1, y1), [sx2, sy2] = toSvg(x2, y2);
      const l = document.createElementNS(ns, "line");
      l.setAttribute("x1", sx1); l.setAttribute("y1", sy1);
      l.setAttribute("x2", sx2); l.setAttribute("y2", sy2);
      l.setAttribute("stroke", "var(--zone-line)"); l.setAttribute("stroke-width", 1.5);
      l.setAttribute("stroke-dasharray", "5 5");
      g.appendChild(l);
    };
    dashLine(colX[0], -hw, colX[0], hw);
    dashLine(colX[1], -hw, colX[1], hw);
    dashLine(-hl, rowY[0], hl, rowY[0]);
    dashLine(-hl, rowY[1], hl, rowY[1]);
    for (let z = 1; z <= 9; z++) {
      const c = zoneCenterPoint(z);
      const [sx, sy] = toSvg(c.x, c.y);
      const t = document.createElementNS(ns, "text");
      t.setAttribute("x", sx); t.setAttribute("y", sy + 4);
      t.setAttribute("text-anchor", "middle");
      t.setAttribute("class", "zone-label");
      t.textContent = String(z);
      g.appendChild(t);
    }
  }
  buildPitch();
  buildZoneGrid();

  const $ballGroup = el("ballGroup"), $ballHandle = el("ballHandle");
  const $activeZoneRect = el("activeZoneRect");
  const $kickDirLine = el("kickDirLine"), $kickDirDot = el("kickDirDot");

  $ballHandle.setAttribute("fill", "var(--ball-fill)"); $ballHandle.setAttribute("stroke", "var(--ball-stroke)"); $ballHandle.setAttribute("stroke-width", 2);

  const roleColors = { lead: "var(--lead)", assist: "var(--assist)", goalie: "var(--goalie)" };
  const roleGroups = {};
  for (const role of ["lead", "assist", "goalie"]) {
    const group = el(role + "Group");
    const handle = el(role + "Handle");
    const heading = el(role + "Heading");
    handle.setAttribute("fill", roleColors[role]);
    handle.setAttribute("stroke", "var(--panel)");
    handle.setAttribute("stroke-width", 2.5);
    heading.setAttribute("stroke", roleColors[role]);
    roleGroups[role] = { group, handle, heading };
  }

  function positionRoleGroup(role, pose) {
    const { group, heading } = roleGroups[role];
    const [sx, sy] = toSvg(pose.x, pose.y);
    group.setAttribute("transform", `translate(${sx}, ${sy})`);
    const hlen = 24;
    const hx = hlen * Math.cos(pose.theta), hy = -hlen * Math.sin(pose.theta);
    heading.setAttribute("x1", 0); heading.setAttribute("y1", 0);
    heading.setAttribute("x2", hx); heading.setAttribute("y2", hy);
  }

  function fillRoleCard(role, pose) {
    el(role + "Pose").textContent = `(${pose.x.toFixed(2)}, ${pose.y.toFixed(2)}) @ ${deg(pose.theta).toFixed(0)}°`;
    el(role + "Branch").textContent = pose.branch;
    el(role + "Cite").textContent = pose.cite;
  }

  function render() {
    const s = computeScenario();
    const [bsx, bsy] = toSvg(s.ball.x, s.ball.y);
    $ballGroup.setAttribute("transform", `translate(${bsx}, ${bsy})`);
    $ballHandle.style.cursor = state.type === "corner" || state.type === "goalkick" ? "default" : "grab";

    positionRoleGroup("lead", s.lead);
    positionRoleGroup("assist", s.assist);
    positionRoleGroup("goalie", s.goalie);
    fillRoleCard("lead", s.lead);
    fillRoleCard("assist", s.assist);
    fillRoleCard("goalie", s.goalie);

    if (s.kickDirLine) {
      const [fx, fy] = toSvg(s.kickDirLine.from.x, s.kickDirLine.from.y);
      const [tx, ty] = toSvg(s.kickDirLine.to.x, s.kickDirLine.to.y);
      $kickDirLine.setAttribute("x1", fx); $kickDirLine.setAttribute("y1", fy);
      $kickDirLine.setAttribute("x2", tx); $kickDirLine.setAttribute("y2", ty);
      $kickDirDot.setAttribute("cx", tx); $kickDirDot.setAttribute("cy", ty);
      $kickDirLine.style.display = "block"; $kickDirDot.style.display = "block";
    } else {
      $kickDirLine.style.display = "none"; $kickDirDot.style.display = "none";
    }

    if (s.zone >= 1 && s.zone <= 9) {
      const c = zoneCenterPoint(s.zone);
      const [x0, y0] = toSvg(c.x - FD.length / 6, c.y + FD.width / 6);
      $activeZoneRect.setAttribute("x", x0); $activeZoneRect.setAttribute("y", y0);
      $activeZoneRect.setAttribute("width", (FD.length / 3) * PXPM);
      $activeZoneRect.setAttribute("height", (FD.width / 3) * PXPM);
      $activeZoneRect.style.display = "block";
    } else {
      $activeZoneRect.style.display = "none";
    }

    el("scenarioPill").innerHTML = `${s.scenarioLabel}<span class="zone-line">Zone ${s.zone} · band ${s.band}</span>`;
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
  function makeDraggable(handleEl, canDrag, onMove) {
    const down = (evt) => {
      if (!canDrag()) return;
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
  makeDraggable(
    $ballHandle,
    () => state.type === "direct" || state.type === "indirect" || state.type === "throwin",
    ([fx, fy]) => {
      if (state.type === "throwin") {
        state.throwinX = cap(fx, 6.8, -6.8);
      } else {
        state.ball.x = cap(fx, FD.length / 2 - 0.1, -FD.length / 2 + 0.1);
        state.ball.y = cap(fy, FD.width / 2 - 0.1, -FD.width / 2 + 0.1);
      }
    }
  );

  // ---- control wiring ----
  function updateBallUiVisibility() {
    root.querySelectorAll("[data-ball-ui]").forEach((elm) => {
      const kind = elm.getAttribute("data-ball-ui");
      let show;
      if (kind === "lanes") show = state.type === "goalkick" && state.side === "attack";
      else if (kind === "free") show = state.type === "direct" || state.type === "indirect";
      else show = kind === state.type;
      elm.style.display = show ? "" : "none";
    });
  }

  function wireSeg(segId, dataAttr, onPick) {
    const segEl = el(segId);
    segEl.querySelectorAll("button").forEach((btn) => {
      const handler = () => {
        segEl.querySelectorAll("button").forEach((b) => b.classList.remove("active", "attack", "defense"));
        btn.classList.add("active");
        if (segId === "sideSeg") btn.classList.add(btn.getAttribute(dataAttr));
        onPick(btn.getAttribute(dataAttr));
        updateBallUiVisibility();
        render();
      };
      btn.addEventListener("click", handler);
      cleanupFns.push(() => btn.removeEventListener("click", handler));
    });
  }
  wireSeg("typeSeg", "data-type", (v) => { state.type = v; });
  wireSeg("sideSeg", "data-side", (v) => { state.side = v; });
  el("sideSeg").querySelector('[data-side="attack"]').classList.add("attack");
  wireSeg("touchlineSeg", "data-touchline", (v) => { state.touchline = v; });
  wireSeg("cornerSeg", "data-corner", (v) => { state.cornerSide = v; });
  wireSeg("goalkickCornerSeg", "data-gkcorner", (v) => { state.gkCorner = v; });

  for (const laneKey of ["Top", "Centre", "Bottom"]) {
    const input = el("lane" + laneKey);
    const chip = input.closest(".toggle-chip");
    const handler = () => {
      state.lanes[laneKey.toLowerCase()] = input.checked;
      chip.classList.toggle("on", input.checked);
      chip.classList.toggle("off", !input.checked);
      render();
    };
    input.addEventListener("change", handler);
    cleanupFns.push(() => input.removeEventListener("change", handler));
  }

  updateBallUiVisibility();
  render();

  return () => {
    cleanupFns.forEach((fn) => fn());
  };
}

export default function FreekickExplorer() {
  const rootRef = useRef(null);

  useEffect(() => {
    document.title = "Set-Piece Position Explorer — Freekick Strategy";
    if (!rootRef.current) return;
    const cleanup = initInteractive(rootRef.current);
    return cleanup;
  }, []);

  return (
    <>
      <Header />
      <div
        className="freekick-explorer-page"
        ref={rootRef}
        dangerouslySetInnerHTML={{ __html: CONTENT_HTML }}
      />
    </>
  );
}
