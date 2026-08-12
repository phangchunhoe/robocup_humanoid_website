import { useRef, useState } from "react";
import VizFrame from "../VizFrame.jsx";
import { useDraggablePoint } from "../../../lib/useDraggablePoint.js";
import { toPInPI } from "../../../lib/sim/host.js";

const SIZE = 280;
const SCALE = 40;
const ORIGIN = { x: 40, y: SIZE / 2 };
const toSvg = (fx, fy) => [ORIGIN.x + fx * SCALE, ORIGIN.y - fy * SCALE];
const toField = (sx, sy) => [(sx - ORIGIN.x) / SCALE, -(sy - ORIGIN.y) / SCALE];

const POST_X = 5.2;
const POST_Y = 1.3; // goalWidth / 2

export default function GoalpostBearingsViz() {
  const svgRef = useRef(null);
  const [ball, setBall] = useState({ x: 1.5, y: -0.8 });

  const bind = useDraggablePoint(
    svgRef,
    (sx, sy) => {
      const [fx, fy] = toField(sx, sy);
      return { x: fx, y: fy };
    },
    setBall
  );

  const thetaL = Math.atan2(POST_Y - ball.y, POST_X - ball.x);
  const thetaR = Math.atan2(-POST_Y - ball.y, POST_X - ball.x);
  const kickDir = toPInPI((thetaL + thetaR) / 2);

  const [bx, by] = toSvg(ball.x, ball.y);
  const [lx, ly] = toSvg(POST_X, POST_Y);
  const [rx, ry] = toSvg(POST_X, -POST_Y);
  const rayLen = 220;
  const [kx, ky] = [bx + rayLen * Math.cos(kickDir), by - rayLen * Math.sin(kickDir)];

  return (
    <VizFrame
      caption={
        <>
          Bearings to each post: <b>{((thetaL * 180) / Math.PI).toFixed(0)}°</b> and{" "}
          <b>{((thetaR * 180) / Math.PI).toFixed(0)}°</b>. Kick direction (their average) is{" "}
          <b>{((kickDir * 180) / Math.PI).toFixed(0)}°</b> — straight at the middle of the goal mouth.
        </>
      }
    >
      <svg ref={svgRef} className="sm-diagram" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Draggable ball with bearing lines to each goalpost and the resulting kick-direction bisector">
        <defs>
          <clipPath id="goalpost-bearings-clip">
            <rect x={0} y={0} width={SIZE} height={SIZE} />
          </clipPath>
        </defs>
        <g clipPath="url(#goalpost-bearings-clip)">
          <line x1={lx} y1={ly} x2={rx} y2={ry} className="sm-axis" strokeWidth={4} />
          <line x1={bx} y1={by} x2={lx} y2={ly} className="sm-guide" />
          <line x1={bx} y1={by} x2={rx} y2={ry} className="sm-guide" />
          <line x1={bx} y1={by} x2={kx} y2={ky} className="sm-vector" />
        </g>
        <circle cx={lx} cy={ly} r={4} fill="var(--color-label)" />
        <circle cx={rx} cy={ry} r={4} fill="var(--color-label)" />
        <circle cx={bx} cy={by} r={9} className="sm-ball" {...bind} />
      </svg>
    </VizFrame>
  );
}
