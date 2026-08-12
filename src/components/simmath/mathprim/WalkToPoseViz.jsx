import { useRef, useState } from "react";
import VizFrame from "../VizFrame.jsx";
import RobotGlyph from "../RobotGlyph.jsx";
import { useDraggablePoint } from "../../../lib/useDraggablePoint.js";
import { cap, toPInPI, norm } from "../../../lib/sim/host.js";

const SIZE = 280;
const SCALE = 40;
const ORIGIN = { x: SIZE / 2, y: SIZE / 2 };
const toSvg = (fx, fy) => [ORIGIN.x + fx * SCALE, ORIGIN.y - fy * SCALE];
const toField = (sx, sy) => [(sx - ORIGIN.x) / SCALE, -(sy - ORIGIN.y) / SCALE];
const VX_LIMIT = 1.0;

/**
 * Simplified illustrative version of moveToPoseOnField2 — the long/short-range branch
 * and the resulting velocity command, with the obstacle-avoidance state machine left
 * out (it needs an obstacle to avoid, which this diagram has no room for).
 */
function walkToPose(robot, target, longRangeThreshold) {
  const range = norm(target.x - robot.x, target.y - robot.y);
  const bearing = Math.atan2(target.y - robot.y, target.x - robot.x);
  const thetaErr = toPInPI(bearing - robot.theta);

  if (range > longRangeThreshold) {
    return { mode: "long-range", vx: cap(range, -VX_LIMIT, VX_LIMIT), vy: 0, vtheta: thetaErr };
  }
  return { mode: "short-range", vx: range * Math.cos(thetaErr), vy: range * Math.sin(thetaErr), vtheta: thetaErr };
}

export default function WalkToPoseViz() {
  const svgRef = useRef(null);
  const [robotTheta, setRobotTheta] = useState(0.3);
  const [target, setTarget] = useState({ x: 2.5, y: 1 });
  const [threshold, setThreshold] = useState(1.5);

  const bindTarget = useDraggablePoint(
    svgRef,
    (sx, sy) => {
      const [fx, fy] = toField(sx, sy);
      return { x: fx, y: fy };
    },
    setTarget
  );

  const robot = { x: 0, y: 0, theta: robotTheta };
  const cmd = walkToPose(robot, target, threshold);

  const [rsx, rsy] = toSvg(0, 0);
  const [tsx, tsy] = toSvg(target.x, target.y);
  // Command vector drawn in field frame for legibility (rotate the robot-frame vx/vy
  // back out by theta), scaled up since these are metres/second, not metres.
  const c = Math.cos(robot.theta);
  const s = Math.sin(robot.theta);
  const cmdFieldX = cmd.vx * c - cmd.vy * s;
  const cmdFieldY = cmd.vx * s + cmd.vy * c;
  const cmdLen = 55;
  const [cx, cy] = [rsx + cmdFieldX * cmdLen, rsy - cmdFieldY * cmdLen];

  return (
    <VizFrame
      controls={
        <>
          <div className="sm-field-row">
            <label htmlFor="wtp-heading">
              Robot heading <span className="sm-field-value">{((robotTheta * 180) / Math.PI).toFixed(0)}°</span>
            </label>
            <input id="wtp-heading" className="sm-range" type="range" min={-3.14} max={3.14} step={0.05} value={robotTheta} onChange={(e) => setRobotTheta(Number(e.target.value))} />
          </div>
          <div className="sm-field-row">
            <label htmlFor="wtp-threshold">
              Long-range threshold <span className="sm-field-value">{threshold.toFixed(1)} m</span>
            </label>
            <input id="wtp-threshold" className="sm-range" type="range" min={0.3} max={3} step={0.1} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} />
          </div>
        </>
      }
      caption={
        <>
          <b>{cmd.mode}</b> — command (v<sub>x</sub>, v<sub>y</sub>) = ({cmd.vx.toFixed(2)}, {cmd.vy.toFixed(2)}). Drag
          the target across the threshold circle to switch modes.
        </>
      }
    >
      <svg ref={svgRef} className="sm-diagram" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Draggable target showing the walk-to-pose controller's long-range vs short-range command">
        <circle cx={rsx} cy={rsy} r={threshold * SCALE} className="sm-guide" />
        <line x1={rsx} y1={rsy} x2={cx} y2={cy} className="sm-vector" />
        <RobotGlyph x={rsx} y={rsy} theta={robot.theta} />
        <circle cx={tsx} cy={tsy} r={8} className="sm-ball" {...bindTarget} />
      </svg>
    </VizFrame>
  );
}
