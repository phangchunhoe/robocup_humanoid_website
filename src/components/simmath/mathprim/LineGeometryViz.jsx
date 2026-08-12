import { useRef, useState } from "react";
import VizFrame from "../VizFrame.jsx";
import { useDraggablePoint } from "../../../lib/useDraggablePoint.js";
import { pointPerpDistToLine, pointMinDistToLine } from "../../../lib/sim/host.js";

const SIZE = 280;
const SCALE = 26;
const ORIGIN = { x: SIZE / 2, y: SIZE / 2 };
const toSvg = (fx, fy) => [ORIGIN.x + fx * SCALE, ORIGIN.y - fy * SCALE];
const toField = (sx, sy) => [(sx - ORIGIN.x) / SCALE, -(sy - ORIGIN.y) / SCALE];

export default function LineGeometryViz() {
  const svgRef = useRef(null);
  const [l0, setL0] = useState({ x: -3, y: -1 });
  const [l1, setL1] = useState({ x: 2, y: 1.5 });
  const [p, setP] = useState({ x: 3, y: -2 });

  const toLocal = (sx, sy) => {
    const [fx, fy] = toField(sx, sy);
    return { x: fx, y: fy };
  };
  const bindL0 = useDraggablePoint(svgRef, toLocal, setL0);
  const bindL1 = useDraggablePoint(svgRef, toLocal, setL1);
  const bindP = useDraggablePoint(svgRef, toLocal, setP);

  const line = { x0: l0.x, y0: l0.y, x1: l1.x, y1: l1.y };
  const perpDist = Math.abs(pointPerpDistToLine(p, line));
  const minDist = pointMinDistToLine(p, line);
  const offSegment = Math.abs(perpDist - minDist) > 1e-6;

  // Foot of the perpendicular, for the dashed projection line — same projection math
  // pointPerpDistToLine uses internally, just kept here to draw it.
  const dx = l1.x - l0.x;
  const dy = l1.y - l0.y;
  const t = ((p.x - l0.x) * dx + (p.y - l0.y) * dy) / (dx * dx + dy * dy);
  const foot = { x: l0.x + t * dx, y: l0.y + t * dy };

  const [sl0x, sl0y] = toSvg(l0.x, l0.y);
  const [sl1x, sl1y] = toSvg(l1.x, l1.y);
  const [spx, spy] = toSvg(p.x, p.y);
  const [sfx, sfy] = toSvg(foot.x, foot.y);

  return (
    <VizFrame
      caption={
        offSegment ? (
          <>
            The perpendicular foot falls outside the segment — minDist (<b>{minDist.toFixed(2)}</b>) snaps to the
            nearer endpoint instead of the (shorter, but off-segment) perpDist (<b>{perpDist.toFixed(2)}</b>).
          </>
        ) : (
          <>
            Foot of the perpendicular lands on the segment, so minDist and perpDist agree: <b>{minDist.toFixed(2)}</b>.
          </>
        )
      }
    >
      <svg ref={svgRef} className="sm-diagram" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Draggable point and line segment, comparing perpendicular distance to nearest-point-on-segment distance">
        <line x1={sl0x} y1={sl0y} x2={sl1x} y2={sl1y} className="sm-axis" strokeWidth={2.5} />
        <line x1={spx} y1={spy} x2={sfx} y2={sfy} className="sm-guide" />
        {offSegment && <circle cx={sfx} cy={sfy} r={3} fill="var(--color-tertiary-label)" />}

        <circle cx={sl0x} cy={sl0y} r={7} className="sm-handle" {...bindL0} />
        <circle cx={sl1x} cy={sl1y} r={7} className="sm-handle" {...bindL1} />
        <circle cx={spx} cy={spy} r={8} className="sm-ball" {...bindP} />
      </svg>
    </VizFrame>
  );
}
