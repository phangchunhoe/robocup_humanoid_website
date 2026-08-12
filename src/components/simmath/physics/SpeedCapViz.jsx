import { useRef, useState } from "react";
import VizFrame from "../VizFrame.jsx";
import { useDraggablePoint } from "../../../lib/useDraggablePoint.js";
import { capToMaxSpeed } from "../../../lib/sim/physics.js";

const SIZE = 260;
const CENTER = SIZE / 2;
// px per m/s — the drag plane covers roughly ±1.7x the max slider value.
const SCALE = 70;

export default function SpeedCapViz() {
  const svgRef = useRef(null);
  const [maxSpeed, setMaxSpeed] = useState(1.0);
  const [v, setV] = useState({ x: 1.3, y: 0.8 });

  const toLocal = (sx, sy) => ({
    x: (sx - CENTER) / SCALE,
    y: -(sy - CENTER) / SCALE,
  });
  const bind = useDraggablePoint(svgRef, toLocal, setV);

  const capped = capToMaxSpeed(v.x, v.y, maxSpeed);
  const speed = Math.hypot(v.x, v.y);
  const wasCapped = speed > maxSpeed;

  const toSvg = (x, y) => [CENTER + x * SCALE, CENTER - y * SCALE];
  const [hx, hy] = toSvg(v.x, v.y);
  const [cx, cy] = toSvg(capped.x, capped.y);

  return (
    <VizFrame
      controls={
        <div className="sm-field-row">
          <label htmlFor="speedcap-max">
            v<sub>max</sub> <span className="sm-field-value">{maxSpeed.toFixed(2)} m/s</span>
          </label>
          <input
            id="speedcap-max"
            className="sm-range"
            type="range"
            min={0.3}
            max={1.6}
            step={0.05}
            value={maxSpeed}
            onChange={(e) => setMaxSpeed(Number(e.target.value))}
          />
        </div>
      }
      caption={
        <>
          Drag the handle. Commanded <b>({v.x.toFixed(2)}, {v.y.toFixed(2)})</b>, {speed.toFixed(2)} m/s
          {" → "}
          {wasCapped ? (
            <>rescaled to <b>({capped.x.toFixed(2)}, {capped.y.toFixed(2)})</b>, exactly v<sub>max</sub></>
          ) : (
            <>unchanged — already under v<sub>max</sub></>
          )}
          .
        </>
      }
    >
      <svg
        ref={svgRef}
        className="sm-diagram"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label="Draggable velocity vector against a max-speed circle"
      >
        <circle cx={CENTER} cy={CENTER} r={maxSpeed * SCALE} className="sm-guide" />
        <line x1={0} y1={CENTER} x2={SIZE} y2={CENTER} className="sm-axis" opacity={0.4} />
        <line x1={CENTER} y1={0} x2={CENTER} y2={SIZE} className="sm-axis" opacity={0.4} />

        {/* commanded vector, faded */}
        <line x1={CENTER} y1={CENTER} x2={hx} y2={hy} className="sm-vector-secondary" opacity={0.5} strokeDasharray="4 3" />
        {/* capped (actual) vector */}
        {wasCapped && <line x1={CENTER} y1={CENTER} x2={cx} y2={cy} className="sm-vector" />}

        <circle cx={hx} cy={hy} r={9} className="sm-handle" {...bind} />
        <text x={hx + 12} y={hy - 8} className="sm-label">
          (vx, vy)
        </text>
      </svg>
    </VizFrame>
  );
}
