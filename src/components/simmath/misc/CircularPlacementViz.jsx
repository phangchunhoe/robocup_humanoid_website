import { useState } from "react";
import RobotGlyph from "../RobotGlyph.jsx";
import VizFrame from "../VizFrame.jsx";
import { placementFor, ANGLE_STEP_DEG } from "../../../lib/sim/approachKickTest.js";

const SIZE = 280;
const CENTER = SIZE / 2;
const SCALE = 70;
const RADIUS_M = 1.6;

const ALL_ANGLES = Array.from({ length: Math.round(360 / ANGLE_STEP_DEG) }, (_, i) => i * ANGLE_STEP_DEG);

export default function CircularPlacementViz() {
  const [angleDeg, setAngleDeg] = useState(120);

  const { robot } = placementFor(angleDeg, RADIUS_M, 0, 0);
  const [rx, ry] = [CENTER + robot.x * SCALE, CENTER - robot.y * SCALE];

  return (
    <VizFrame
      controls={
        <div className="sm-field-row">
          <label htmlFor="cp-angle">
            Angle <span className="sm-field-value">{angleDeg}°</span>
          </label>
          <input id="cp-angle" className="sm-range" type="range" min={0} max={350} step={ANGLE_STEP_DEG} value={angleDeg} onChange={(e) => setAngleDeg(Number(e.target.value))} />
        </div>
      }
      caption={`${ALL_ANGLES.length} angles × 3 repeats = ${ALL_ANGLES.length * 3} runs per sweep — the faint ring below marks all of them, the highlighted robot is the one the slider picked, always turned to face the ball.`}
    >
      <svg className="sm-diagram" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Robot placements swept around a circle centred on the ball, one highlighted by the angle slider">
        <circle cx={CENTER} cy={CENTER} r={RADIUS_M * SCALE} className="sm-guide" />
        {ALL_ANGLES.map((a) => {
          const p = placementFor(a, RADIUS_M, 0, 0);
          const [px, py] = [CENTER + p.robot.x * SCALE, CENTER - p.robot.y * SCALE];
          return <circle key={a} cx={px} cy={py} r={3} fill="var(--color-tertiary-label)" opacity={a === angleDeg ? 0 : 0.7} />;
        })}
        <RobotGlyph x={rx} y={ry} theta={robot.theta} />
        <circle cx={CENTER} cy={CENTER} r={9} className="sm-ball" />
      </svg>
    </VizFrame>
  );
}
