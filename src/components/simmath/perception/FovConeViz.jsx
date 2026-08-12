import { useRef, useState } from "react";
import VizFrame from "../VizFrame.jsx";
import RobotGlyph from "../RobotGlyph.jsx";
import { useDraggablePoint } from "../../../lib/useDraggablePoint.js";
import { computeBallPerception, BALL_FOV_HALF_ANGLE_RAD } from "../../../lib/sim/perception.js";
import { makeRng } from "../../../lib/sim/physics.js";

const SIZE = 280;
const ORIGIN = { x: SIZE / 2, y: SIZE - 30 };
// px per metre — chosen so the default 10m sight range's circle still fits the panel.
const SCALE = 22;
const toSvg = (fx, fy) => [ORIGIN.x + fx * SCALE, ORIGIN.y - fy * SCALE];
const toField = (sx, sy) => [(sx - ORIGIN.x) / SCALE, -(sy - ORIGIN.y) / SCALE];
const RNG = makeRng(1); // jitter is off (intensity 0) below, so this is never actually drawn from

export default function FovConeViz() {
  const svgRef = useRef(null);
  const [ball, setBall] = useState({ x: 2.5, y: 4 });
  const [range, setRange] = useState(10);

  const bind = useDraggablePoint(
    svgRef,
    (sx, sy) => {
      const [fx, fy] = toField(sx, sy);
      return { x: fx, y: fy };
    },
    setBall
  );

  const world = {
    robot: { x: 0, y: 0, theta: Math.PI / 2 },
    ball,
    physics: { ballSightRangeM: range, ballJitterIntensity: 0 },
    rng: RNG,
  };
  const perception = computeBallPerception(world);

  const [rsx, rsy] = toSvg(0, 0);
  const [bsx, bsy] = toSvg(ball.x, ball.y);
  const coneR = range * SCALE;
  const a0 = Math.PI / 2 - BALL_FOV_HALF_ANGLE_RAD;
  const a1 = Math.PI / 2 + BALL_FOV_HALF_ANGLE_RAD;
  const p0 = [rsx + coneR * Math.cos(a0), rsy - coneR * Math.sin(a0)];
  const p1 = [rsx + coneR * Math.cos(a1), rsy - coneR * Math.sin(a1)];

  return (
    <VizFrame
      controls={
        <div className="sm-field-row">
          <label htmlFor="fov-range">
            Sight range R <span className="sm-field-value">{range.toFixed(1)} m</span>
          </label>
          <input id="fov-range" className="sm-range" type="range" min={2} max={12} step={0.5} value={range} onChange={(e) => setRange(Number(e.target.value))} />
        </div>
      }
      caption={
        <span className="sm-status-pill">
          <span className={`sm-status-dot ${perception.visible ? "is-success" : "is-error"}`} />
          {perception.visible ? `Visible — ${perception.confidence.toFixed(0)}% confidence` : "Not visible"} — drag the ball.
        </span>
      }
    >
      <svg ref={svgRef} className="sm-diagram" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Draggable ball against the robot's field-of-view cone and sight range">
        <path d={`M ${rsx} ${rsy} L ${p0[0]} ${p0[1]} A ${coneR} ${coneR} 0 0 0 ${p1[0]} ${p1[1]} Z`} fill="var(--color-accent)" opacity={0.1} />
        <path d={`M ${p0[0]} ${p0[1]} A ${coneR} ${coneR} 0 0 0 ${p1[0]} ${p1[1]}`} className="sm-guide" fill="none" />
        <line x1={rsx} y1={rsy} x2={p0[0]} y2={p0[1]} className="sm-guide" />
        <line x1={rsx} y1={rsy} x2={p1[0]} y2={p1[1]} className="sm-guide" />

        <RobotGlyph x={rsx} y={rsy} theta={world.robot.theta} />
        <circle cx={bsx} cy={bsy} r={9} className={perception.visible ? "sm-ball" : "sm-ball-hidden"} {...bind} />
      </svg>
    </VizFrame>
  );
}
