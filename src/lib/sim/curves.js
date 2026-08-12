// Curve sampling shared between runtime.js's telemetry reconstruction (drawing the
// chase path from the interpreted C++'s own locals) and the Simulation Math page's
// visualizations, so there is exactly one definition of each curve — not a live copy
// in runtime.js and a second, potentially-drifting one for the explainer page.

/** One point on a cubic Bezier curve, standard Bernstein-basis evaluation. */
export function cubicBezierPoint(P0, P1, P2, P3, s) {
  const it = 1 - s;
  return {
    x: it * it * it * P0.x + 3 * it * it * s * P1.x + 3 * it * s * s * P2.x + s * s * s * P3.x,
    y: it * it * it * P0.y + 3 * it * it * s * P1.y + 3 * it * s * s * P2.y + s * s * s * P3.y,
  };
}

/** Samples a cubic Bezier from s=0 to s=1 (inclusive) in `step`-sized increments. */
export function sampleCubicBezier(P0, P1, P2, P3, step = 0.05) {
  const pts = [];
  for (let s = 0; s <= 1.0001; s += step) {
    pts.push(cubicBezierPoint(P0, P1, P2, P3, Math.min(s, 1)));
  }
  return pts;
}

/**
 * One point on the exponential-decay long-range curve, in the (u, v) frame aligned to
 * kickDir: u closes linearly toward 0, v decays exponentially toward 0.
 */
export function longRangeCurvePoint({ target, kickDir, u0, v0, decay }, s) {
  const ux = Math.cos(kickDir);
  const uy = Math.sin(kickDir);
  const vx = -Math.sin(kickDir);
  const vy = Math.cos(kickDir);
  const u = u0 * (1 - s);
  const v = v0 * Math.exp(-decay * s);
  return { x: target.x + u * ux + v * vx, y: target.y + u * uy + v * vy };
}

/** Samples the long-range curve from s=0 to s=1 (inclusive) in `step`-sized increments. */
export function sampleLongRangeCurve(params, step = 0.04) {
  const pts = [];
  for (let s = 0; s <= 1.0001; s += step) {
    pts.push(longRangeCurvePoint(params, Math.min(s, 1)));
  }
  return pts;
}
