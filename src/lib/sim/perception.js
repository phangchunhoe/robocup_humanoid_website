// What the robot's vision can actually see of the ball, as opposed to the physics
// engine's ground truth (physics.js's world.ball). One shared source for the FOV/range
// constants so host.js's brain-data path and renderer.js's cone-drawing can never
// disagree about where the boundary is -- the same principle as this codebase's
// --rs-hud-reserve or DECISION_COLOR.

import { ballToRobot, gaussian } from "./physics.js";

export const BALL_FOV_HALF_ANGLE_RAD = (60 * Math.PI) / 180; // 120 degrees total
// Default/fallback sight range (metres) -- the live value is world.physics.ballSightRangeM
// (Drawer slider: "Field of vision radius"), set from this same default in physics.js's
// DEFAULT_PHYSICS. This constant only matters for a world with no physics attached.
export const BALL_SIGHT_RANGE_M = 10;

const CONFIDENCE_FLOOR = 50;

// Jitter sigma ramps from 0 at the robot's feet toward the slider's intensity value as
// distance grows -- ln(2)/JITTER_GROWTH_K =~ 2.3m is the "half-grown" point, and it's
// at ~95% of full intensity by the default BALL_SIGHT_RANGE_M (10m).
const JITTER_GROWTH_K = 0.3;

/**
 * The robot's actual view of the ball this tick: whether it's within the 120deg/
 * ballSightRangeM cone, how confident that reading is, and where it's perceived (with
 * distance-scaled noise) in both robot and field frames. Computed unconditionally every
 * tick, regardless of whether the brain is actually using it (see SimHost.usePreciseBall)
 * -- it also drives the debug FOV-cone/perceived-marker overlay.
 */
export function computeBallPerception(world) {
  const sightRange = (world.physics && world.physics.ballSightRangeM) || BALL_SIGHT_RANGE_M;
  const rel = ballToRobot(world); // {x, y, range, yaw} in the robot frame; yaw IS bearing
  const visible = Math.abs(rel.yaw) <= BALL_FOV_HALF_ANGLE_RAD && rel.range <= sightRange;
  // confidence(0) = 100, confidence(sightRange) = exactly the floor, exponential in
  // between -- deliberately lands on CONFIG_DEFAULTS.ball_confidence_threshold (50).
  // Recomputed from the live sight range (rather than a module-level constant) so the
  // floor still lands exactly at the cone's edge as the "Field of vision radius" slider
  // moves it.
  const decayK = Math.log(100 / CONFIDENCE_FLOOR) / sightRange;
  const confidence = visible ? Math.max(CONFIDENCE_FLOOR, 100 * Math.exp(-decayK * rel.range)) : 0;

  const intensity = (world.physics && world.physics.ballJitterIntensity) || 0;
  const sigma = intensity * (1 - Math.exp(-JITTER_GROWTH_K * rel.range));
  const jx = sigma > 0 ? gaussian(world.rng) * sigma : 0;
  const jy = sigma > 0 ? gaussian(world.rng) * sigma : 0;

  const px = rel.x + jx;
  const py = rel.y + jy;
  const c = Math.cos(world.robot.theta);
  const s = Math.sin(world.robot.theta);
  const fieldX = world.robot.x + px * c - py * s;
  const fieldY = world.robot.y + px * s + py * c;

  return {
    visible,
    confidence,
    robotFrame: { x: px, y: py, range: Math.hypot(px, py), yaw: Math.atan2(py, px) },
    fieldFrame: { x: fieldX, y: fieldY },
  };
}
