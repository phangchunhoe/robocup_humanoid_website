import "./ApproachKickTimeExplainer.css";

// Mirrors the real sweep in src/lib/sim/approachKickTest.js: ANGLE_STEP_DEG
// (10) x REPEATS (3) = 108 runs across 36 angles. Kept in sync by eye rather
// than imported, since this diagram only shows a legible subset of the ring
// (12 dots), not a literal 1:1 render of every angle.
const RING_ANGLE_COUNT = 36;
const REPEATS = 3;
const TOTAL_RUNS = RING_ANGLE_COUNT * REPEATS;

// The diagram reads top-to-bottom as goal -> ring of strikers, with the
// ball back at the ring's own centre (as in the very first version of this
// diagram) rather than pulled out between the goal and the ring -- the goal
// sits above the whole ring+ball group as a separate element and does not
// otherwise move them. See the component doc comment below for how the
// kicking point is defined relative to this.
const VIEW_W = 168;
const VIEW_H = 168;
const CENTER_X = VIEW_W / 2;

const GOAL_TOP = 8;
const GOAL_BOTTOM = 32;
const GOAL_LEFT = CENTER_X - 30;
const GOAL_RIGHT = CENTER_X + 30;

const RING_R = 54; // the testing spot -- radius x, set by the user
// Ring surrounds the ball, centred on it, below the goal.
const RING_CENTER = { x: CENTER_X, y: GOAL_BOTTOM + 14 + RING_R };

const BALL_Y = RING_CENTER.y; // the ball sits at the centre of the ring
const BALL_R = 6;

// The one shared kicking point every striker converges on: immediately
// behind the ball, on the side facing away from the goal (goal is up, ring
// of strikers is down, so "behind" is down) -- goal -> ball -> striker.
// That's where a robot actually stands to kick the ball forward, through
// it, toward the goal on the far side.
const KICK_POINT = { x: CENTER_X, y: BALL_Y + (BALL_R + 8) };

const DIAGRAM_DOT_COUNT = 12; // a legible sample of the ring, not all 36

// Half-step angle offset so no dot sits exactly at 12 o'clock, under the
// ball/kicking point, or at 6 o'clock -- keeps the ring visually symmetric
// about the vertical goal/ball/ring axis instead of pointing a dot straight
// at either.
function ringPoint(index, count, radius, center) {
  const angle = ((index + 0.5) / count) * Math.PI * 2 - Math.PI / 2;
  return {
    x: center.x + radius * Math.cos(angle),
    y: center.y + radius * Math.sin(angle),
  };
}

/**
 * The "Approach & Kick Time" tile's detail-modal content (TestCard.jsx),
 * replacing the placeholder description with a short lead line, a small
 * diagram of the ring the strikers are placed around, and a concise 3-step
 * breakdown of how a run is timed — see src/lib/sim/approachKickTest.js for
 * the mechanics this is illustrating (placementFor, runOneCase).
 *
 * The diagram shows all 36 strikers (sampled to DIAGRAM_DOT_COUNT dots for
 * legibility) converging on ONE shared kicking point at the same time, not
 * one robot swept around the ring one angle at a time, and not each dot
 * sliding to its own individual spot -- that's a deliberate simplification
 * of the real test (which runs the 108 cases one after another, each to its
 * own kick position at its own angle), chosen because the test's own
 * description is "36 strikers", plural, and because a single moving dot, or
 * 36 dots each converging on a different point, read as noise rather than
 * the one idea this illustration exists to sell: everyone is kicking the
 * same ball toward the same goal. The layout is goal (top), then the ring
 * of strikers with the ball at its own centre -- same ring+ball geometry as
 * the very first version of this diagram, with the goal added purely as a
 * separate element above it: goal -> ball -> ring of strikers. The kicking
 * point is not the ring's centre (that's the ball); it's the small gap
 * immediately behind the ball, on the side facing the strikers/away from
 * the goal -- the real spot a robot stands in to kick the ball forward
 * through to the goal.
 */
export default function ApproachKickTimeExplainer() {
  // Each dot gets its own --akt-approach-dx/dy: the vector from its own ring
  // position to the one shared kicking point. Every dot's animation runs
  // the same, unstaggered keyframes (see the .css file), so all 12 collapse
  // inward onto that single point together, then ease back out.
  const dots = Array.from({ length: DIAGRAM_DOT_COUNT }, (_, i) => {
    const start = ringPoint(i, DIAGRAM_DOT_COUNT, RING_R, RING_CENTER);
    return {
      start,
      approachVars: {
        "--akt-approach-dx": `${KICK_POINT.x - start.x}px`,
        "--akt-approach-dy": `${KICK_POINT.y - start.y}px`,
      },
    };
  });

  return (
    <div className="akt-explain">
      <p className="test-card-modal-description">
        Simulates all 36 strikers swept around the ball, each one moving from its own
        testing spot to its kick position. The distance between the striker and the
        ball at the start of a run isn't fixed — call it <em>x</em>, an unknown that
        the user determines before the test runs. The time from the start of that
        approach to the kick is captured, repeated 3 times per position, and averaged.
      </p>

      <div className="akt-explain-body">
        <svg
          className="akt-explain-diagram"
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          role="img"
          aria-label="Diagram: a goal above a ball, with 36 strikers arranged in a ring centred on the ball, all converging at the same time on one shared kicking point immediately behind the ball on the side facing the strikers, away from the goal, then back out."
        >
          {/* Goal, at the top */}
          <rect
            x={GOAL_LEFT}
            y={GOAL_TOP}
            width={GOAL_RIGHT - GOAL_LEFT}
            height={GOAL_BOTTOM - GOAL_TOP}
            className="akt-explain-goal"
          />
          <line
            x1={CENTER_X - 20}
            y1={GOAL_TOP}
            x2={CENTER_X - 20}
            y2={GOAL_BOTTOM}
            className="akt-explain-goal-net"
          />
          <line
            x1={CENTER_X + 20}
            y1={GOAL_TOP}
            x2={CENTER_X + 20}
            y2={GOAL_BOTTOM}
            className="akt-explain-goal-net"
          />
          <line
            x1={GOAL_LEFT}
            y1={(GOAL_TOP + GOAL_BOTTOM) / 2}
            x2={GOAL_RIGHT}
            y2={(GOAL_TOP + GOAL_BOTTOM) / 2}
            className="akt-explain-goal-net"
          />

          {/* Ring of testing spots -- the 36 possible starting positions,
              centred on the ball */}
          <circle cx={RING_CENTER.x} cy={RING_CENTER.y} r={RING_R} className="akt-explain-ring" />

          {/* The one shared kicking point, immediately behind the ball on
              the side facing the strikers, away from the goal */}
          <circle cx={KICK_POINT.x} cy={KICK_POINT.y} r="3" className="akt-explain-kick-spot" />
          <line
            x1={CENTER_X}
            y1={BALL_Y + BALL_R}
            x2={KICK_POINT.x}
            y2={KICK_POINT.y}
            className="akt-explain-kick-tick"
          />

          {/* Ball, at the centre of the ring */}
          <circle cx={CENTER_X} cy={BALL_Y} r={BALL_R} className="akt-explain-ball" />

          {/* All 36 (sampled to 12) strikers, each sliding from its own ring
              position in to the one shared kicking point and back out,
              together. */}
          {dots.map((d, i) => (
            <g key={i} className="akt-explain-dot-approach" style={d.approachVars}>
              <circle cx={d.start.x} cy={d.start.y} r="2.5" className="akt-explain-dot" />
            </g>
          ))}
        </svg>

        <ol className="akt-explain-steps">
          <li>
            <span className="akt-explain-step-num">1</span>
            <span className="akt-explain-step-text">
              <strong>Place.</strong> Starts on a ring around the ball, 10° apart, always
              facing it — the ring's radius, x, is set by the user.
            </span>
          </li>
          <li>
            <span className="akt-explain-step-num">2</span>
            <span className="akt-explain-step-text">
              <strong>Time.</strong> The clock starts the instant it begins approaching.
            </span>
          </li>
          <li>
            <span className="akt-explain-step-num">3</span>
            <span className="akt-explain-step-text">
              <strong>Kick.</strong> It stops the instant the robot reaches its kick position and
              kicks — each angle repeats
              {" "}
              {REPEATS}× and the times are averaged.
            </span>
          </li>
        </ol>
      </div>

      <p className="akt-explain-caption">
        {RING_ANGLE_COUNT} angles × {REPEATS} repeats = {TOTAL_RUNS} runs
      </p>
    </div>
  );
}
