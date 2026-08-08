// What the robot's vision can actually see of the ball, as opposed to the physics
// engine's ground truth (physics.js's world.ball). One shared source for the FOV/range
// constants so host.js's brain-data path and renderer.js's cone-drawing can never
// disagree about where the boundary is -- the same principle as this codebase's
// --rs-hud-reserve or DECISION_COLOR.

import { ballToRobot, gaussian } from "./physics.js";

export const BALL_FOV_HALF_ANGLE_RAD = (60 * Math.PI) / 180; // 120 degrees total
export const BALL_SIGHT_RANGE_M = 10;

const CONFIDENCE_FLOOR = 50;
// confidence(0) = 100, confidence(BALL_SIGHT_RANGE_M) = exactly the floor, exponential
// in between -- deliberately lands on CONFIG_DEFAULTS.ball_confidence_threshold (50).
const CONFIDENCE_DECAY_K = Math.log(100 / CONFIDENCE_FLOOR) / BALL_SIGHT_RANGE_M;

// Jitter sigma ramps from 0 at the robot's feet toward the slider's intensity value as
// distance grows -- ln(2)/JITTER_GROWTH_K =~ 2.3m is the "half-grown" point, and it's
// at ~95% of full intensity by BALL_SIGHT_RANGE_M.
const JITTER_GROWTH_K = 0.3;

/**
 * The robot's actual view of the ball this tick: whether it's within the 120deg/10m
 * cone, how confident that reading is, and where it's perceived (with distance-scaled
 * noise) in both robot and field frames. Computed unconditionally every tick,
 * regardless of whether the brain is actually using it (see SimHost.usePreciseBall) --
 * it also drives the debug FOV-cone/perceived-marker overlay.
 */
export function computeBallPerception(world) {
  const rel = ballToRobot(world); // {x, y, range, yaw} in the robot frame; yaw IS bearing
  const visible = Math.abs(rel.yaw) <= BALL_FOV_HALF_ANGLE_RAD && rel.range <= BALL_SIGHT_RANGE_M;
  const confidence = visible
    ? Math.max(CONFIDENCE_FLOOR, 100 * Math.exp(-CONFIDENCE_DECAY_K * rel.range))
    : 0;

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
