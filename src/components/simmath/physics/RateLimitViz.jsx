import { useEffect, useRef, useState } from "react";
import GlassButton from "../../GlassButton.jsx";
import VizFrame from "../VizFrame.jsx";
import MiniLineChart from "../MiniLineChart.jsx";
import { approach } from "../../../lib/sim/physics.js";
import { FIXED_DT } from "../../../lib/sim/engine.js";

const DURATION_S = 1.2;
const STEPS = Math.round(DURATION_S / FIXED_DT);

function simulate(target, maxAccel) {
  let v = 0;
  const history = [{ x: 0, y: 0 }];
  for (let i = 1; i <= STEPS; i += 1) {
    v = approach(v, target, maxAccel * FIXED_DT);
    history.push({ x: i * FIXED_DT, y: v });
  }
  return history;
}

export default function RateLimitViz() {
  const [target, setTarget] = useState(1.0);
  const [maxAccel, setMaxAccel] = useState(1.5);
  const [tick, setTick] = useState(STEPS);
  const rafRef = useRef(null);

  const history = simulate(target, maxAccel);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const play = () => {
    cancelAnimationFrame(rafRef.current);
    let t = 0;
    const start = performance.now();
    const frame = (now) => {
      const elapsed = (now - start) / 1000;
      t = Math.min(STEPS, Math.round(elapsed / FIXED_DT));
      setTick(t);
      if (t < STEPS) rafRef.current = requestAnimationFrame(frame);
    };
    setTick(0);
    rafRef.current = requestAnimationFrame(frame);
  };

  const current = history[tick];
  const reachedAt = history.findIndex((p) => Math.abs(p.y - target) < 1e-6);
  const timeToTarget = reachedAt >= 0 ? (reachedAt * FIXED_DT).toFixed(2) : null;

  return (
    <VizFrame
      controls={
        <>
          <div className="sm-field-row">
            <label htmlFor="rl-target">
              v<sub>target</sub> <span className="sm-field-value">{target.toFixed(2)} m/s</span>
            </label>
            <input id="rl-target" className="sm-range" type="range" min={-1.5} max={1.5} step={0.05} value={target} onChange={(e) => setTarget(Number(e.target.value))} />
          </div>
          <div className="sm-field-row">
            <label htmlFor="rl-accel">
              a<sub>max</sub> <span className="sm-field-value">{maxAccel.toFixed(2)} m/s²</span>
            </label>
            <input id="rl-accel" className="sm-range" type="range" min={0.3} max={4} step={0.1} value={maxAccel} onChange={(e) => setMaxAccel(Number(e.target.value))} />
          </div>
          <GlassButton variant="glass" onClick={play}>
            Play tick-by-tick
          </GlassButton>
        </>
      }
      caption={
        <>
          At tick {tick} ({(tick * FIXED_DT).toFixed(2)}s), v = <b>{current.y.toFixed(2)}</b> m/s.
          {timeToTarget ? <> Reaches the target after <b>{timeToTarget}s</b> — never sooner, no matter how far the jump.</> : " Still catching up."}
        </>
      }
    >
      <MiniLineChart
        width={320}
        height={170}
        xDomain={[0, DURATION_S]}
        yDomain={[Math.min(-0.2, target - 0.2), Math.max(1.7, target + 0.2)]}
        points={history}
        markerX={tick * FIXED_DT}
        markerLabel={(p) => `${p.y.toFixed(2)} m/s`}
        xTicks={[{ value: 0, label: "0" }, { value: DURATION_S, label: `${DURATION_S}s` }]}
        yTicks={[{ value: 0, label: "0" }, { value: target, label: "target" }]}
        xLabel="time"
        yLabel="speed"
      />
    </VizFrame>
  );
}
