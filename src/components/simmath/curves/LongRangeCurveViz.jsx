import { useRef, useState } from "react";
import VizFrame from "../VizFrame.jsx";
import RobotGlyph from "../RobotGlyph.jsx";
import { useDraggablePoint } from "../../../lib/useDraggablePoint.js";
import { sampleLongRangeCurve } from "../../../lib/sim/curves.js";

const SIZE = 300;
const TARGET = { x: 250, y: 150 };
const KICK_DIR = 0; // pointing along +x (screen-right) for a simple, legible diagram

export default function LongRangeCurveViz() {
  const svgRef = useRef(null);
  const [start, setStart] = useState({ x: 40, y: 70 });
  const [decay, setDecay] = useState(4.0);

  const bindStart = useDraggablePoint(svgRef, (sx, sy) => ({ x: sx, y: sy }), setStart);

  const ux = Math.cos(KICK_DIR);
  const uy = Math.sin(KICK_DIR);
  const vx = -Math.sin(KICK_DIR);
  const vy = Math.cos(KICK_DIR);
  const dx = start.x - TARGET.x;
  const dy = start.y - TARGET.y;
  const u0 = dx * ux + dy * uy;
  const v0 = dx * vx + dy * vy;

  const curve = sampleLongRangeCurve({ target: TARGET, kickDir: KICK_DIR, u0, v0, decay });
  const path = curve.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const heading = Math.atan2(TARGET.y - start.y, TARGET.x - start.x);

  return (
    <VizFrame
      controls={
        <div className="sm-field-row">
          <label htmlFor="lrc-decay">
            Decay constant D <span className="sm-field-value">{decay.toFixed(1)}</span>
          </label>
          <input id="lrc-decay" className="sm-range" type="range" min={0.5} max={10} step={0.1} value={decay} onChange={(e) => setDecay(Number(e.target.value))} />
        </div>
      }
      caption="Drag the start point — the curve is redrawn by calling this repo's own longRangeCurvePoint. Higher decay pulls the sideways offset in harder, earlier."
    >
      <svg ref={svgRef} className="sm-diagram" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Draggable exponential-decay long-range curve from a start point to a fixed target">
        <line x1={0} y1={TARGET.y} x2={SIZE} y2={TARGET.y} className="sm-guide" opacity={0.4} />
        <path d={path} fill="none" className="sm-vector" strokeWidth={2.5} />
        <RobotGlyph x={start.x} y={start.y} theta={heading} r={8} lineLength={10} {...bindStart} style={{ cursor: "grab" }} />
        <circle cx={TARGET.x} cy={TARGET.y} r={7} className="sm-ball" />
      </svg>
    </VizFrame>
  );
}
