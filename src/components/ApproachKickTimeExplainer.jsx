import "./ApproachKickTimeExplainer.css";

// Mirrors the real sweep in src/lib/sim/approachKickTest.js: ANGLE_STEP_DEG
// (10) x REPEATS (3) = 108 runs across 36 angles. Kept in sync by eye rather
// than imported, since this diagram only shows a legible subset of the ring
// (12 dots), not a literal 1:1 render of every angle.
const RING_ANGLE_COUNT = 36;
const REPEATS = 3;
const TOTAL_RUNS = RING_ANGLE_COUNT * REPEATS;

const VIEW = 168;
const CENTER = VIEW / 2;
const RING_R = 64;
const DIAGRAM_DOT_COUNT = 12; // a legible sample of the ring, not all 36

function ringPoint(index, count) {
  const angle = (index / count) * Math.PI * 2 - Math.PI / 2; // start at 12 o'clock
  return {
    x: CENTER + RING_R * Math.cos(angle),
    y: CENTER + RING_R * Math.sin(angle),
  };
}

/**
 * The "Approach & Kick Time" tile's detail-modal content (TestCard.jsx),
 * replacing the placeholder description with a short lead line, a small
 * diagram of the ring the robot is swept around, and a concise 3-step
 * breakdown of how a run is timed — see src/lib/sim/approachKickTest.js for
 * the mechanics this is illustrating (placementFor, runOneCase).
 */
export default function ApproachKickTimeExplainer() {
  const dots = Array.from({ length: DIAGRAM_DOT_COUNT }, (_, i) => ringPoint(i, DIAGRAM_DOT_COUNT));
  const robotStart = ringPoint(0, DIAGRAM_DOT_COUNT);

  return (
    <div className="akt-explain">
      <p className="test-card-modal-description">
        Places the 36 striker at a fixed distance from the ball. Calculates the time taken to go from chase/adjust to kick. The time taken to kick is then captured and tested 3 times, from each position. The distance from the robot to ball is configured by the user. 
      </p>

      <div className="akt-explain-body">
        <svg
          className="akt-explain-diagram"
          viewBox={`0 0 ${VIEW} ${VIEW}`}
          role="img"
          aria-label="Diagram: the robot starts at a point on a ring around the ball, always facing it, sweeping all the way around between runs, then approaches and kicks."
        >
          <defs>
            <marker
              id="akt-explain-arrowhead"
              markerWidth="6"
              markerHeight="6"
              refX="4.5"
              refY="3"
              orient="auto"
            >
              <path d="M0,0 L6,3 L0,6 Z" className="akt-explain-arrowhead-fill" />
            </marker>
          </defs>

          {/* Sweep ring — the 36 possible starting positions */}
          <circle cx={CENTER} cy={CENTER} r={RING_R} className="akt-explain-ring" />
          {dots.map((d, i) => (
            <circle key={i} cx={d.x} cy={d.y} r="2.5" className="akt-explain-dot" />
          ))}

          {/* Ball, fixed at the centre */}
          <circle cx={CENTER} cy={CENTER} r="6" className="akt-explain-ball" />

          {/* Robot: one rigid group rotating about the ball, so "always
              facing the ball" and the inward kick line stay correct at
              every angle without recomputing per-frame. */}
          <g className="akt-explain-robot-group">
            <line
              x1={CENTER}
              y1={CENTER}
              x2={robotStart.x}
              y2={robotStart.y}
              className="akt-explain-face-line"
            />
            <line
              x1={robotStart.x}
              y1={robotStart.y + 9}
              x2={CENTER}
              y2={CENTER - 9}
              className="akt-explain-kick-line"
              markerEnd="url(#akt-explain-arrowhead)"
            />
            <circle cx={robotStart.x} cy={robotStart.y} r="5" className="akt-explain-robot" />
          </g>
        </svg>

        <ol className="akt-explain-steps">
          <li>
            <span className="akt-explain-step-num">1</span>
            <span className="akt-explain-step-text">
              <strong>Place.</strong> Starts on a ring around the ball, 10° apart, always
              facing it.
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
              <strong>Kick.</strong> It stops the instant the robot kicks — each angle repeats
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
