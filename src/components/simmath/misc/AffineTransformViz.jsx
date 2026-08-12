import { useRef, useState } from "react";
import VizFrame from "../VizFrame.jsx";
import { useDraggablePoint } from "../../../lib/useDraggablePoint.js";
import { toSvg, VIEW_W, VIEW_H } from "../../../lib/sim/field.js";

const FIELD_PANEL = 220;
const FIELD_SCALE = 22; // local px per metre for *this* small diagram, not toSvg's own 60
const FC = FIELD_PANEL / 2;
const localToSvg = (fx, fy) => [FC + fx * FIELD_SCALE, FC - fy * FIELD_SCALE];
const localToField = (sx, sy) => [(sx - FC) / FIELD_SCALE, -(sy - FC) / FIELD_SCALE];

const MINI_SCALE = 160 / VIEW_W;

export default function AffineTransformViz() {
  const svgRef = useRef(null);
  const [pos, setPos] = useState({ x: 2, y: 1.5 });

  const bind = useDraggablePoint(
    svgRef,
    (sx, sy) => {
      const [fx, fy] = localToField(sx, sy);
      return { x: fx, y: fy };
    },
    setPos
  );

  const [lx, ly] = localToSvg(pos.x, pos.y);
  const [px, py] = toSvg(pos.x, pos.y);
  const [mx, my] = [px * MINI_SCALE, py * MINI_SCALE];

  return (
    <VizFrame
      caption={
        <>
          Field ({pos.x.toFixed(1)}, {pos.y.toFixed(1)}) m → SVG ({px.toFixed(0)}, {py.toFixed(0)}) px — the dot on
          the right is that exact pixel position on the full 900×600 canvas.
        </>
      }
    >
      <div style={{ display: "flex", gap: "var(--space-5)", alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
        <div>
          <svg ref={svgRef} className="sm-diagram" viewBox={`0 0 ${FIELD_PANEL} ${FIELD_PANEL}`} style={{ maxWidth: 200 }} role="img" aria-label="Draggable point in field metres">
            <line x1={0} y1={FC} x2={FIELD_PANEL} y2={FC} className="sm-axis" opacity={0.3} />
            <line x1={FC} y1={0} x2={FC} y2={FIELD_PANEL} className="sm-axis" opacity={0.3} />
            <circle cx={lx} cy={ly} r={8} className="sm-ball" {...bind} />
          </svg>
          <p className="sm-label" style={{ textAlign: "center", marginTop: 4 }}>
            field (metres)
          </p>
        </div>

        <div>
          <svg className="sm-diagram" viewBox="0 0 160 107" style={{ maxWidth: 160 }} role="img" aria-label="Where that point lands on the full SVG pixel canvas">
            <rect x={0} y={0} width={VIEW_W * MINI_SCALE} height={VIEW_H * MINI_SCALE} fill="none" className="sm-axis" />
            <circle cx={mx} cy={my} r={5} className="sm-ball" />
          </svg>
          <p className="sm-label" style={{ textAlign: "center", marginTop: 4 }}>
            SVG (pixels, 900×600)
          </p>
        </div>
      </div>
    </VizFrame>
  );
}
