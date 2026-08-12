import { useMemo, useState } from "react";
import GlassButton from "../../GlassButton.jsx";
import VizFrame from "../VizFrame.jsx";
import { computeBallPerception } from "../../../lib/sim/perception.js";
import { makeRng } from "../../../lib/sim/physics.js";

const SIZE = 200;
const CENTER = SIZE / 2;
const SCALE = 14; // px per metre of *jitter*, not of field range
const SAMPLE_COUNT = 60;

function samplesAt(range, intensity, seed) {
  const rng = makeRng(seed);
  const world = {
    robot: { x: 0, y: 0, theta: 0 },
    ball: { x: range, y: 0 },
    physics: { ballSightRangeM: 20, ballJitterIntensity: intensity },
    rng,
  };
  const pts = [];
  for (let i = 0; i < SAMPLE_COUNT; i += 1) {
    const p = computeBallPerception(world);
    // Only the offset from true position matters here, not the absolute range.
    pts.push({ dx: p.robotFrame.x - range, dy: p.robotFrame.y });
  }
  return pts;
}

export default function JitterGrowthViz() {
  const [range, setRange] = useState(6);
  const [intensity, setIntensity] = useState(0.15);
  const [seed, setSeed] = useState(1);

  const samples = useMemo(() => samplesAt(range, intensity, seed), [range, intensity, seed]);
  const sigma = intensity * (1 - Math.exp(-0.3 * range));

  return (
    <VizFrame
      controls={
        <>
          <div className="sm-field-row">
            <label htmlFor="jg-range">
              Range <span className="sm-field-value">{range.toFixed(1)} m</span>
            </label>
            <input id="jg-range" className="sm-range" type="range" min={0} max={12} step={0.2} value={range} onChange={(e) => setRange(Number(e.target.value))} />
          </div>
          <div className="sm-field-row">
            <label htmlFor="jg-intensity">
              Intensity I <span className="sm-field-value">{intensity.toFixed(2)} m</span>
            </label>
            <input id="jg-intensity" className="sm-range" type="range" min={0} max={0.3} step={0.01} value={intensity} onChange={(e) => setIntensity(Number(e.target.value))} />
          </div>
          <GlassButton variant="glass" onClick={() => setSeed((s) => s + 1)}>
            Redraw samples
          </GlassButton>
        </>
      }
      caption={
        <>
          {SAMPLE_COUNT} perceived positions for the same true ball spot, σ ≈ <b>{sigma.toFixed(3)} m</b> at this
          range. Right at the robot's feet the cloud is a pinpoint; further out it spreads.
        </>
      }
    >
      <svg className="sm-diagram" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Scatter cloud of perceived ball positions around the true position, growing with range">
        <line x1={0} y1={CENTER} x2={SIZE} y2={CENTER} className="sm-axis" opacity={0.3} />
        <line x1={CENTER} y1={0} x2={CENTER} y2={SIZE} className="sm-axis" opacity={0.3} />
        {samples.map((s, i) => (
          <circle key={i} cx={CENTER + s.dy * SCALE} cy={CENTER - s.dx * SCALE} r={3} fill="var(--color-accent)" opacity={0.35} />
        ))}
        <circle cx={CENTER} cy={CENTER} r={5} className="sm-ball" />
      </svg>
    </VizFrame>
  );
}
