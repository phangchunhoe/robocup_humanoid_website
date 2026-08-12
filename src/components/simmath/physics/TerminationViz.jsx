import { useRef, useState } from "react";
import VizFrame from "../VizFrame.jsx";
import { useDraggablePoint } from "../../../lib/useDraggablePoint.js";
import { terminalResultFor } from "../../../lib/sim/physics.js";
import { FD } from "../../../lib/sim/field.js";

const SCALE = 20;
const MARGIN = 1;
const W = (FD.length + MARGIN * 2) * SCALE;
const H = (FD.width + MARGIN * 2) * SCALE;
const ORIGIN = { x: W / 2, y: H / 2 };
const toSvg = (fx, fy) => [ORIGIN.x + fx * SCALE, ORIGIN.y - fy * SCALE];
const toField = (sx, sy) => [(sx - ORIGIN.x) / SCALE, -(sy - ORIGIN.y) / SCALE];

const RESULT_LABEL = { goal: "GOAL", own_goal: "OWN GOAL", out: "OUT" };

export default function TerminationViz() {
  const svgRef = useRef(null);
  const [ball, setBall] = useState({ x: 6.6, y: 0 });

  const bind = useDraggablePoint(svgRef, (sx, sy) => {
    const [fx, fy] = toField(sx, sy);
    return { x: fx, y: fy };
  }, setBall);

  const result = terminalResultFor({ ball });
  const [bx, by] = toSvg(ball.x, ball.y);
  const hl = FD.length / 2;
  const hw = FD.width / 2;
  const gw = FD.goalWidth / 2;
  const [x0, y0] = toSvg(-hl, -hw);
  const [x1, y1] = toSvg(hl, hw);

  return (
    <VizFrame
      caption={
        <span className="sm-status-pill">
          <span className={`sm-status-dot ${result ? "is-error" : "is-success"}`} />
          {result ? RESULT_LABEL[result] : "IN PLAY"} — drag the ball past a line to see it change.
        </span>
      }
    >
      <svg
        ref={svgRef}
        className="sm-diagram"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Draggable ball over a mini pitch, showing goal/own-goal/out detection live"
      >
        <rect x={Math.min(x0, x1)} y={Math.min(y0, y1)} width={Math.abs(x1 - x0)} height={Math.abs(y1 - y0)} fill="none" className="sm-axis" />
        <line {...svgLine(toSvg(0, -hw), toSvg(0, hw))} className="sm-axis" opacity={0.5} />
        <line {...svgLine(toSvg(hl, -gw), toSvg(hl, gw))} stroke="var(--color-accent)" strokeWidth={4} />
        <line {...svgLine(toSvg(-hl, -gw), toSvg(-hl, gw))} stroke="var(--color-accent)" strokeWidth={4} />

        <circle cx={bx} cy={by} r={7} className={`sm-handle ${result ? "is-out" : ""}`} style={result ? { stroke: "var(--color-error)" } : undefined} {...bind} />
      </svg>
    </VizFrame>
  );
}

function svgLine([x1, y1], [x2, y2]) {
  return { x1, y1, x2, y2 };
}
