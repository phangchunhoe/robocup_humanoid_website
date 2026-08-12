import { useMemo, useRef, useState } from "react";
import VizFrame from "../VizFrame.jsx";
import MiniLineChart from "../MiniLineChart.jsx";
import { useDraggablePoint } from "../../../lib/useDraggablePoint.js";
import { norm, cap, sigmoid } from "../../../lib/sim/host.js";

const NORM_SIZE = 100;
const NORM_C = NORM_SIZE / 2;
const NORM_SCALE = 16;

export default function NormCapSigmoidViz() {
  const normSvgRef = useRef(null);
  const [p, setP] = useState({ x: 2, y: 1.5 });
  const bindP = useDraggablePoint(
    normSvgRef,
    (sx, sy) => ({ x: (sx - NORM_C) / NORM_SCALE, y: -(sy - NORM_C) / NORM_SCALE }),
    setP
  );
  const [px, py] = [NORM_C + p.x * NORM_SCALE, NORM_C - p.y * NORM_SCALE];
  const distance = norm(p.x, p.y);

  const [capX, setCapX] = useState(1.4);
  const capped = cap(capX, -1, 1);

  const [sigX, setSigX] = useState(0);
  const sigCurve = useMemo(() => {
    const pts = [];
    for (let x = -6; x <= 6; x += 0.2) pts.push({ x, y: sigmoid(x, 0, 1) });
    return pts;
  }, []);

  return (
    <VizFrame
      caption="Three small, unrelated helpers the interpreted code leans on constantly — distance, clamping, and a smooth on/off switch."
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)", width: "100%" }}>
        <div>
          <p className="sm-label" style={{ marginBottom: 4 }}>
            norm(x, y) — drag the point
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
            <svg ref={normSvgRef} className="sm-diagram" viewBox={`0 0 ${NORM_SIZE} ${NORM_SIZE}`} style={{ maxWidth: 100 }} role="img" aria-label="Draggable point showing its distance from the origin">
              <line x1={0} y1={NORM_C} x2={NORM_SIZE} y2={NORM_C} className="sm-axis" opacity={0.3} />
              <line x1={NORM_C} y1={0} x2={NORM_C} y2={NORM_SIZE} className="sm-axis" opacity={0.3} />
              <line x1={NORM_C} y1={NORM_C} x2={px} y2={py} className="sm-vector" />
              <circle cx={px} cy={py} r={7} className="sm-handle" {...bindP} />
            </svg>
            <span className="sm-readout">
              <span className="k">norm =</span> <span className="v">{distance.toFixed(2)}</span>
            </span>
          </div>
        </div>

        <div className="sm-field-row">
          <label htmlFor="mp-cap">
            cap(x, −1, 1) <span className="sm-field-value">{capX.toFixed(2)} → {capped.toFixed(2)}</span>
          </label>
          <input id="mp-cap" className="sm-range" type="range" min={-2} max={2} step={0.05} value={capX} onChange={(e) => setCapX(Number(e.target.value))} />
        </div>

        <div>
          <div className="sm-field-row" style={{ marginBottom: 4 }}>
            <label htmlFor="mp-sig">
              sigmoid(x) <span className="sm-field-value">x = {sigX.toFixed(1)}</span>
            </label>
            <input id="mp-sig" className="sm-range" type="range" min={-6} max={6} step={0.1} value={sigX} onChange={(e) => setSigX(Number(e.target.value))} />
          </div>
          <MiniLineChart
            width={300}
            height={130}
            xDomain={[-6, 6]}
            yDomain={[0, 1]}
            points={sigCurve}
            markerX={sigX}
            markerLabel={(pt) => pt.y.toFixed(2)}
            xTicks={[{ value: 0, label: "0" }]}
            yTicks={[{ value: 0, label: "0" }, { value: 1, label: "1" }]}
          />
        </div>
      </div>
    </VizFrame>
  );
}
