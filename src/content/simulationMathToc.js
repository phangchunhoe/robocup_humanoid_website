// Table-of-contents structure for the Simulation Math page — one entry per section,
// each with its formulas' anchors. The sticky sidebar nav (SimulationMath.jsx) renders
// this directly; each section component's FormulaBlock `id` props must match the
// `id`s listed here, or the TOC links and the scroll-spy highlighting will silently
// stop matching up.
const simulationMathToc = [
  {
    id: "physics-engine",
    label: "Physics engine",
    formulas: [
      { id: "prng", label: "PRNG (mulberry32)" },
      { id: "gaussian-noise", label: "Gaussian noise" },
      { id: "speed-cap", label: "Commanded-speed cap" },
      { id: "rate-limit", label: "Rate limiting" },
      { id: "frame-integration", label: "Frame integration" },
      { id: "ball-roll", label: "Ball rolling resistance" },
      { id: "kick-impulse", label: "Foot/ball contact & kick" },
      { id: "torso-collision", label: "Torso collision" },
      { id: "termination", label: "Termination geometry" },
      { id: "frame-transform", label: "Field→robot-frame transform" },
    ],
  },
  {
    id: "perception-model",
    label: "Perception model",
    formulas: [
      { id: "fov-test", label: "Field-of-view test" },
      { id: "confidence-decay", label: "Confidence decay" },
      { id: "jitter-growth", label: "Jitter growth" },
    ],
  },
  {
    id: "math-primitives",
    label: "Math primitives",
    formulas: [
      { id: "norm-cap-sigmoid", label: "norm / cap / sigmoid" },
      { id: "angle-norm", label: "Angle normalization" },
      { id: "line-geometry", label: "Line/segment geometry" },
      { id: "goalpost-bearings", label: "Goalpost bearings" },
      { id: "walk-to-pose", label: "Walk-to-pose controller" },
    ],
  },
  {
    id: "telemetry-curves",
    label: "Telemetry curves",
    formulas: [
      { id: "cubic-bezier", label: "Cubic Bézier" },
      { id: "long-range-curve", label: "Exponential-decay curve" },
    ],
  },
  {
    id: "realtime-loop",
    label: "Real-time loop",
    formulas: [{ id: "fixed-timestep", label: "Fixed-timestep accumulator" }],
  },
  {
    id: "approach-kick-test",
    label: "Approach & Kick Time test",
    formulas: [
      { id: "circular-placement", label: "Circular placement" },
      { id: "timing-average", label: "Timing" },
    ],
  },
  {
    id: "field-svg-mapping",
    label: "Field ↔ SVG mapping",
    formulas: [{ id: "to-svg", label: "Affine transform" }],
  },
];

export default simulationMathToc;
