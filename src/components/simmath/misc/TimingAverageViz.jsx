import { useMemo, useState } from "react";
import VizFrame from "../VizFrame.jsx";
import MiniBarChart from "../MiniBarChart.jsx";
import { makeRng, gaussian } from "../../../lib/sim/physics.js";
import { ANGLE_STEP_DEG, REPEATS } from "../../../lib/sim/approachKickTest.js";

const ANGLES = Array.from({ length: Math.round(360 / ANGLE_STEP_DEG) }, (_, i) => i * ANGLE_STEP_DEG);

// Illustrative only — a real sweep interprets a pasted striker program per run, which
// this static page has no source for. Shaped so angles near the ball's far side (180°,
// a full circle-back) plausibly take longer than approaching from roughly in front (0°),
// with seeded Gaussian noise standing in for run-to-run variation.
function syntheticRunsFor(angleDeg, seed) {
  const rng = makeRng(seed + angleDeg);
  const base = 1.1 + 0.9 * (1 - Math.cos((angleDeg * Math.PI) / 180)) * 0.5;
  return Array.from({ length: REPEATS }, () => Math.max(0.4, base + gaussian(rng) * 0.18));
}

export default function TimingAverageViz() {
  const [angleDeg, setAngleDeg] = useState(180);
  const [seed] = useState(7);

  const allAverages = useMemo(
    () => ANGLES.map((a) => {
      const runs = syntheticRunsFor(a, seed);
      return { angleDeg: a, avg: runs.reduce((s, v) => s + v, 0) / runs.length };
    }),
    [seed]
  );
  const runs = syntheticRunsFor(angleDeg, seed);
  const avg = runs.reduce((s, v) => s + v, 0) / runs.length;

  const bars = allAverages.map((a) => ({ value: a.avg }));
  const selectedIndex = ANGLES.indexOf(angleDeg);

  return (
    <VizFrame
      controls={
        <div className="sm-field-row">
          <label htmlFor="ta-angle">
            Angle <span className="sm-field-value">{angleDeg}°</span>
          </label>
          <input id="ta-angle" className="sm-range" type="range" min={0} max={350} step={ANGLE_STEP_DEG} value={angleDeg} onChange={(e) => setAngleDeg(Number(e.target.value))} />
        </div>
      }
      caption={
        <>
          Illustrative data, not a real sweep (that needs a pasted striker program). At {angleDeg}°, the{" "}
          {REPEATS} repeats were [{runs.map((r) => r.toFixed(2)).join(", ")}]s → average <b>{avg.toFixed(2)}s</b>.
        </>
      }
    >
      <MiniBarChart
        width={320}
        height={170}
        bars={bars}
        xLabel="approach angle"
        yLabel="avg time (s)"
        barColor={(_, i) => (i === selectedIndex ? "var(--color-accent)" : "color-mix(in srgb, var(--color-accent) 45%, transparent)")}
      />
    </VizFrame>
  );
}
