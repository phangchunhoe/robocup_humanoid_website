import { useEffect, useRef, useState } from "react";
import GlassButton from "../../GlassButton.jsx";
import VizFrame from "../VizFrame.jsx";
import MiniLineChart from "../MiniLineChart.jsx";
import { applyRollingResistance, DEFAULT_PHYSICS } from "../../../lib/sim/physics.js";
import { FIXED_DT } from "../../../lib/sim/engine.js";

const TRACK_W = 300;
const MAX_TIME = 4;

export default function BallRollViz() {
  const [initialSpeed, setInitialSpeed] = useState(2.5);
  const [decel, setDecel] = useState(DEFAULT_PHYSICS.ballDecel);
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState([{ x: 0, y: initialSpeed }]);
  const [pos, setPos] = useState(0);
  const rafRef = useRef(null);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const kick = () => {
    cancelAnimationFrame(rafRef.current);
    let vx = initialSpeed;
    let t = 0;
    let x = 0;
    const hist = [{ x: 0, y: vx }];
    setRunning(true);
    const step = () => {
      const rolled = applyRollingResistance(vx, 0, decel, DEFAULT_PHYSICS.ballStopSpeed, FIXED_DT);
      vx = rolled.x;
      x += vx * FIXED_DT;
      t += FIXED_DT;
      hist.push({ x: t, y: vx });
      setHistory([...hist]);
      setPos(x);
      if (vx > 0 && t < MAX_TIME) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        setRunning(false);
      }
    };
    rafRef.current = requestAnimationFrame(step);
  };

  const trackX = Math.min(TRACK_W - 12, (pos / 6) * TRACK_W);

  return (
    <VizFrame
      controls={
        <>
          <div className="sm-field-row">
            <label htmlFor="br-speed">
              Initial speed <span className="sm-field-value">{initialSpeed.toFixed(1)} m/s</span>
            </label>
            <input id="br-speed" className="sm-range" type="range" min={0.5} max={4} step={0.1} value={initialSpeed} onChange={(e) => setInitialSpeed(Number(e.target.value))} disabled={running} />
          </div>
          <div className="sm-field-row">
            <label htmlFor="br-decel">
              a<sub>ball</sub> <span className="sm-field-value">{decel.toFixed(2)} m/s²</span>
            </label>
            <input id="br-decel" className="sm-range" type="range" min={0.2} max={2} step={0.05} value={decel} onChange={(e) => setDecel(Number(e.target.value))} disabled={running} />
          </div>
          <GlassButton variant="glass" onClick={kick} disabled={running}>
            Kick
          </GlassButton>
        </>
      }
      caption="Speed drops in a straight line every tick, so it always reaches zero in finite time — no exponential tail that rolls forever, unlike the perception jitter/confidence curves below."
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", width: "100%" }}>
        <svg className="sm-diagram" viewBox={`0 0 ${TRACK_W} 40`} role="img" aria-label="Ball rolling to a stop along a track">
          <line x1={4} y1={30} x2={TRACK_W - 4} y2={30} className="sm-axis" />
          <circle cx={12 + trackX} cy={20} r={9} className="sm-ball" />
        </svg>
        <MiniLineChart
          width={320}
          height={150}
          xDomain={[0, MAX_TIME]}
          yDomain={[0, 4]}
          points={history}
          xTicks={[{ value: 0, label: "0" }, { value: MAX_TIME, label: `${MAX_TIME}s` }]}
          yTicks={[{ value: 0, label: "0" }]}
          xLabel="time"
          yLabel="ball speed"
        />
      </div>
    </VizFrame>
  );
}
