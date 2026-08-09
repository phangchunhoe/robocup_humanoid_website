// The run step's physics drawer sliders — label/unit/note metadata shared
// with the Approach & Kick Time PDF report (src/lib/pdf/approachKickReport.js)
// so both read the same source of truth instead of carrying two copies that
// can drift apart.
const SLIDERS = [
  { key: "ballJitterIntensity", label: "Ball jitter intensity", min: 0, max: 0.5, step: 0.02, unit: "m",
    note: "perceived-ball noise σ at long range; decays exponentially near the ball" },
  { key: "ballSightRangeM", label: "Field of vision radius", min: 2, max: 15, step: 0.5, unit: "m",
    note: "120° cone; ball perception range cutoff" },
  { key: "kickGain", label: "Kick gain", min: 1.0, max: 6.0, step: 0.1, unit: "×",
    note: "ball speed ÷ foot closing speed" },
  { key: "kickDirSigmaDeg", label: "Kick scatter σ", min: 0, max: 25, step: 0.5, unit: "°",
    note: "Gaussian, per strike" },
  { key: "kickSpeedJitter", label: "Speed jitter", min: 0, max: 0.6, step: 0.02, unit: "±",
    note: "multiplicative on outgoing speed" },
  { key: "ballDecel", label: "Ball rolling decel", min: 0.2, max: 2.5, step: 0.05, unit: "m/s²",
    note: "turf, μ ≈ 0.08" },
];

export default SLIDERS;
