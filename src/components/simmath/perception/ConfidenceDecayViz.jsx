import { useMemo, useState } from "react";
import VizFrame from "../VizFrame.jsx";
import MiniLineChart from "../MiniLineChart.jsx";
import { computeBallPerception } from "../../../lib/sim/perception.js";
import { makeRng } from "../../../lib/sim/physics.js";

const RNG = makeRng(1); // jitterIntensity is 0 below, so this stream is never actually drawn from

function confidenceAt(range, sightRangeM) {
  const world = {
    robot: { x: 0, y: 0, theta: 0 },
    ball: { x: range, y: 0 },
    physics: { ballSightRangeM: sightRangeM, ballJitterIntensity: 0 },
    rng: RNG,
  };
  return computeBallPerception(world).confidence;
}

export default function ConfidenceDecayViz() {
  const [sightRangeM, setSightRangeM] = useState(10);
  const [range, setRange] = useState(6);

  const curve = useMemo(() => {
    const pts = [];
    const maxX = sightRangeM * 1.25;
    for (let r = 0; r <= maxX; r += maxX / 60) pts.push({ x: r, y: confidenceAt(r, sightRangeM) });
    pts.push({ x: maxX, y: confidenceAt(maxX, sightRangeM) });
    return pts;
  }, [sightRangeM]);

  const current = confidenceAt(range, sightRangeM);

  return (
    <VizFrame
      controls={
        <>
          <div className="sm-field-row">
            <label htmlFor="cd-range">
              Ball range <span className="sm-field-value">{range.toFixed(1)} m</span>
            </label>
            <input id="cd-range" className="sm-range" type="range" min={0} max={sightRangeM * 1.25} step={0.1} value={range} onChange={(e) => setRange(Number(e.target.value))} />
          </div>
          <div className="sm-field-row">
            <label htmlFor="cd-sight">
              Sight range R <span className="sm-field-value">{sightRangeM.toFixed(1)} m</span>
            </label>
            <input id="cd-sight" className="sm-range" type="range" min={4} max={12} step={0.5} value={sightRangeM} onChange={(e) => setSightRangeM(Number(e.target.value))} />
          </div>
        </>
      }
      caption={
        <>
          At {range.toFixed(1)} m, confidence is <b>{current.toFixed(0)}%</b>. It fades smoothly out to R, then
          drops straight to 0 — past the sight range, there's no partial credit.
        </>
      }
    >
      <MiniLineChart
        width={320}
        height={170}
        xDomain={[0, sightRangeM * 1.25]}
        yDomain={[0, 105]}
        points={curve}
        markerX={range}
        markerLabel={(p) => `${p.y.toFixed(0)}%`}
        xTicks={[{ value: 0, label: "0" }, { value: sightRangeM, label: "R" }]}
        yTicks={[{ value: 0, label: "0" }, { value: 100, label: "100" }]}
        xLabel="range"
        yLabel="confidence"
      />
    </VizFrame>
  );
}
