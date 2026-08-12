import { useRef, useState } from "react";
import VizFrame from "../VizFrame.jsx";
import { useDraggablePoint } from "../../../lib/useDraggablePoint.js";
import { sampleCubicBezier } from "../../../lib/sim/curves.js";

const SIZE = 300;

const HANDLE_CLASS = { P0: "sm-robot", P1: "sm-handle", P2: "sm-handle", P3: "sm-ball" };

export default function CubicBezierViz() {
  const svgRef = useRef(null);
  const [points, setPoints] = useState({
    P0: { x: 40, y: 220 },
    P1: { x: 90, y: 60 },
    P2: { x: 200, y: 260 },
    P3: { x: 260, y: 90 },
  });

  const toLocal = (sx, sy) => ({ x: sx, y: sy });
  const bindP0 = useDraggablePoint(svgRef, toLocal, (p) => setPoints((s) => ({ ...s, P0: p })));
  const bindP1 = useDraggablePoint(svgRef, toLocal, (p) => setPoints((s) => ({ ...s, P1: p })));
  const bindP2 = useDraggablePoint(svgRef, toLocal, (p) => setPoints((s) => ({ ...s, P2: p })));
  const bindP3 = useDraggablePoint(svgRef, toLocal, (p) => setPoints((s) => ({ ...s, P3: p })));
  const binds = { P0: bindP0, P1: bindP1, P2: bindP2, P3: bindP3 };

  const curve = sampleCubicBezier(points.P0, points.P1, points.P2, points.P3);
  const path = curve.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  return (
    <VizFrame caption="Drag any of the four points — the curve is redrawn by calling this repo's own cubicBezierPoint, the exact function runtime.js uses to draw a live chase path.">
      <svg ref={svgRef} className="sm-diagram" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Draggable cubic Bezier curve with four control points">
        <line x1={points.P0.x} y1={points.P0.y} x2={points.P1.x} y2={points.P1.y} className="sm-guide" />
        <line x1={points.P2.x} y1={points.P2.y} x2={points.P3.x} y2={points.P3.y} className="sm-guide" />
        <path d={path} fill="none" className="sm-vector" strokeWidth={2.5} />
        {Object.entries(points).map(([key, p]) => (
          <circle key={key} cx={p.x} cy={p.y} r={key === "P0" || key === "P3" ? 8 : 6} className={HANDLE_CLASS[key]} {...binds[key]} />
        ))}
      </svg>
    </VizFrame>
  );
}
