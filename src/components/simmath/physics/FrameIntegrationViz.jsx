import { useState } from "react";
import VizFrame from "../VizFrame.jsx";
import RobotGlyph from "../RobotGlyph.jsx";
import { integrateRobotPose } from "../../../lib/sim/physics.js";

const SIZE = 280;
const CENTER = SIZE / 2;
// One "step" is stretched to a full second of travel (dt=1) purely so the arrow is
// visible at this scale — physics.js itself always uses dt=0.01s per real tick.
const DT_DISPLAY = 1;
const SCALE = 60; // px per metre of that stretched step

export default function FrameIntegrationViz() {
  const [vx, setVx] = useState(0.8);
  const [vy, setVy] = useState(0.3);
  const [vtheta, setVtheta] = useState(0.6);
  const [theta, setTheta] = useState(0.3);

  const next = integrateRobotPose(0, 0, theta, vx, vy, vtheta, DT_DISPLAY);
  const [nx, ny] = [CENTER + next.x * SCALE, CENTER - next.y * SCALE];

  return (
    <VizFrame
      controls={
        <>
          <div className="sm-field-row">
            <label htmlFor="fi-vx">
              v<sub>x</sub> <span className="sm-field-value">{vx.toFixed(2)}</span>
            </label>
            <input id="fi-vx" className="sm-range" type="range" min={-1.2} max={1.2} step={0.05} value={vx} onChange={(e) => setVx(Number(e.target.value))} />
          </div>
          <div className="sm-field-row">
            <label htmlFor="fi-vy">
              v<sub>y</sub> <span className="sm-field-value">{vy.toFixed(2)}</span>
            </label>
            <input id="fi-vy" className="sm-range" type="range" min={-1.2} max={1.2} step={0.05} value={vy} onChange={(e) => setVy(Number(e.target.value))} />
          </div>
          <div className="sm-field-row">
            <label htmlFor="fi-vt">
              θ̇ <span className="sm-field-value">{vtheta.toFixed(2)} rad/s</span>
            </label>
            <input id="fi-vt" className="sm-range" type="range" min={-2} max={2} step={0.1} value={vtheta} onChange={(e) => setVtheta(Number(e.target.value))} />
          </div>
          <div className="sm-field-row">
            <label htmlFor="fi-heading">
              heading θ <span className="sm-field-value">{theta.toFixed(2)} rad</span>
            </label>
            <input id="fi-heading" className="sm-range" type="range" min={-3.14} max={3.14} step={0.05} value={theta} onChange={(e) => setTheta(Number(e.target.value))} />
          </div>
        </>
      }
      caption={
        <>
          The robot-frame (v<sub>x</sub>, v<sub>y</sub>) is rotated by the current heading before it's
          added — so the ghost robot moves in the direction it's <i>facing</i>, not along the field's raw
          x/y axes. One second of travel shown here for visibility; a real tick is 0.01s.
        </>
      }
    >
      <svg className="sm-diagram" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Robot heading integrating into a field-frame displacement">
        <line x1={0} y1={CENTER} x2={SIZE} y2={CENTER} className="sm-axis" opacity={0.3} />
        <line x1={CENTER} y1={0} x2={CENTER} y2={SIZE} className="sm-axis" opacity={0.3} />

        <line x1={CENTER} y1={CENTER} x2={nx} y2={ny} className="sm-vector" strokeDasharray="5 4" />
        <RobotGlyph x={nx} y={ny} theta={next.theta} opacity={0.45} />

        <RobotGlyph x={CENTER} y={CENTER} theta={theta} />
        <text x={CENTER + 14} y={CENTER + 18} className="sm-label">
          now
        </text>
        <text x={nx + 10} y={ny - 8} className="sm-label-accent">
          +1s
        </text>
      </svg>
    </VizFrame>
  );
}
