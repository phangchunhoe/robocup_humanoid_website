import { useState } from "react";
import VizFrame from "../VizFrame.jsx";
import { toPInPI } from "../../../lib/sim/host.js";

const SIZE = 200;
const CENTER = SIZE / 2;
const R = 70;

export default function AngleNormViz() {
  const [rawDeg, setRawDeg] = useState(250);
  const raw = (rawDeg * Math.PI) / 180;
  const wrapped = toPInPI(raw);
  const wrappedDeg = (wrapped * 180) / Math.PI;

  const dot = (angleRad) => [CENTER + R * Math.cos(angleRad), CENTER - R * Math.sin(angleRad)];
  const [wx, wy] = dot(wrapped);
  const turns = Math.round((rawDeg - wrappedDeg) / 360);

  return (
    <VizFrame
      controls={
        <div className="sm-field-row">
          <label htmlFor="an-raw">
            raw θ <span className="sm-field-value">{rawDeg}°</span>
          </label>
          <input id="an-raw" className="sm-range" type="range" min={-1080} max={1080} step={5} value={rawDeg} onChange={(e) => setRawDeg(Number(e.target.value))} />
        </div>
      }
      caption={
        <>
          {rawDeg}° {turns !== 0 ? `(${Math.abs(turns)} extra turn${Math.abs(turns) === 1 ? "" : "s"} ${turns > 0 ? "forward" : "back"}) ` : ""}
          normalizes to <b>{wrappedDeg.toFixed(0)}°</b> — same point on the dial, however many times it wound around to get there.
        </>
      }
    >
      <svg className="sm-diagram" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Compass dial showing a raw angle, which may exceed a full turn, normalized onto a single ring">
        <circle cx={CENTER} cy={CENTER} r={R} className="sm-guide" />
        <line x1={CENTER} y1={CENTER} x2={CENTER + R} y2={CENTER} className="sm-axis" opacity={0.4} />
        <text x={CENTER + R + 8} y={CENTER + 4} className="sm-label">
          0°
        </text>
        <line x1={CENTER} y1={CENTER} x2={wx} y2={wy} className="sm-vector" />
        <circle cx={wx} cy={wy} r={7} className="sm-ball" />
      </svg>
    </VizFrame>
  );
}
