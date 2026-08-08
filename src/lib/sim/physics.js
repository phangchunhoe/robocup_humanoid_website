// Rigid-body-lite physics for one humanoid robot and one ball on a 2D pitch.
//
// Everything is in field coordinates: metres, radians, origin at the centre circle,
// +x toward the opponent goal, +y left, theta CCW-positive. This matches the C++.
//
// The robot is a holonomic base: the brain commands (vx, vy, vtheta) in the ROBOT
// frame via brain->client->setVelocity(), which is exactly what the real walk
// controller consumes. We rate-limit and cap that command, then integrate it.
//
// There is no kick actuator in the real brain. Kick::onRunning executes a walk-through
// strike -- setVelocity(speed, 0, 0) or crabWalk(kickDir, speed) with _speed ramping
// +0.1 per tick -- so the ball is struck by the moving foot. We model that directly:
// contact between a moving foot and the ball imparts an impulse. See kickGain below.

import { FD } from "./field.js";

export const BALL_RADIUS = 0.107; // FIFA size 5
export const ROBOT_RADIUS = 0.16; // torso half-width, for body collision only
const FOOT_FORWARD = 0.18; // foot contact point ahead of the robot centre (m)
const FOOT_HALF_WIDTH = 0.07; // effective foot radius in the horizontal plane
// The feet stick out in front of the torso, so a ball approached head-on must reach the
// foot (0.18 + 0.07 + ball radius = 0.357 m from centre) before the torso (0.267 m)
// could shove it. Torso collision is therefore restricted to the rear/side cone below;
// without that, the body circle shields the foot and the robot only ever dribbles.
const TORSO_CONTACT_CONE = (60 * Math.PI) / 180;
const CONTACT_SLOP = 0.02; // tolerance so grazing contact still registers

/** Deterministic PRNG (mulberry32) so a seeded run is exactly reproducible. */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller, using the supplied uniform generator. Exported for perception.js's
 *  ball-jitter noise, which draws from the same seeded stream as kick scatter. */
export function gaussian(rng) {
  let u = 0;
  while (u === 0) u = rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export const DEFAULT_PHYSICS = {
  // Robot. The real config.yaml has vx_limit 1.2; the plan calls for a 1.0 m/s default
  // walk speed. No longer a drawer slider (see ballJitterIntensity below), but still
  // the fixed cap stepWorld applies to the commanded velocity.
  maxWalkSpeed: 1.0, // m/s, caps the resultant of vx/vy after the brain's own caps
  maxAccel: 1.5, // m/s^2   (matches MAX_ACCEL_X/Y in TickChaseNode)
  maxAngAccel: 3.0, // rad/s^2 (matches MAX_ACCEL_THETA in TickChaseNode)

  // Ball. Rolling resistance on artificial turf, mu ~ 0.08 -> a ~ 0.8 m/s^2.
  ballDecel: 0.8, // m/s^2
  ballStopSpeed: 0.05, // m/s below which the ball is considered stopped

  // Contact / kick. The foot is moving at the commanded walk speed when it meets the
  // ball; a walk-through strike at 1.1 m/s sends an adult-size ball roughly 6-7 m,
  // which is kickGain ~ 3.
  kickGain: 3.0,
  kickDirSigmaDeg: 8.0, // Gaussian scatter on the outgoing direction
  kickDirBias: 0.06, // rad, systematic right-foot pull. CalcKickDir compensates for
  // exactly this with `kickDir -= 0.06` (brain_tree.cpp:3920).
  kickSpeedJitter: 0.2, // +/- 20% multiplicative on the outgoing speed

  // Perception. Sigma (metres) of the perceived-ball position noise at long range —
  // see perception.js's computeBallPerception, which ramps this from 0 near the robot
  // up to ~this value by BALL_SIGHT_RANGE_M. Drawer slider: "Ball jitter intensity".
  ballJitterIntensity: 0.15,
  seed: 12345,
};

export function createWorld(initial, physics) {
  return {
    t: 0,
    robot: {
      x: initial.robot.x,
      y: initial.robot.y,
      theta: initial.robot.theta,
      // Actual achieved velocity in the robot frame, after rate limiting.
      vx: 0,
      vy: 0,
      vtheta: 0,
    },
    ball: { x: initial.ball.x, y: initial.ball.y, vx: 0, vy: 0 },
    // Last command the brain issued, in the robot frame.
    command: { vx: 0, vy: 0, vtheta: 0 },
    // An array of segments, each an array of [x, y] points — not one flat
    // point list. A new segment starts each time tracking resumes after
    // being paused (RobotSimulator.jsx's onToggleTrail pushes it), so the
    // renderer can draw each as its own subpath: resuming continues the
    // line from wherever the robot currently is, rather than a straight
    // connector jumping across whatever ground was covered while paused.
    trail: [],
    // Whether new points are currently being appended to the trail's current
    // (last) segment — the trail toggle button's on/off state, mutated
    // directly by the caller (RobotSimulator.jsx). Existing segments stay
    // put when this goes false; only Clear (worldRef.current.trail.length =
    // 0) empties them. Starts true: the path draws from the very first
    // step of a run by default, with no separate action needed to begin
    // recording it — Stop (which halts stepping entirely) is what actually
    // stops new points from being added, not this flag on its own.
    trailTracking: true,
    events: [],
    result: null, // "goal" | "own_goal" | "out" | null
    physics: { ...DEFAULT_PHYSICS, ...physics },
    rng: makeRng((physics && physics.seed) || DEFAULT_PHYSICS.seed),
    lastContactT: -1,
  };
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function approach(current, target, maxDelta) {
  const d = target - current;
  if (d > maxDelta) return current + maxDelta;
  if (d < -maxDelta) return current - maxDelta;
  return target;
}

/**
 * Advance the world by one fixed step.
 *
 * `dt` should be small and constant (0.01 s, matching the brain's 100 Hz tick) so
 * results are reproducible regardless of display refresh rate.
 */

// Caps the total point count across every trail segment combined, trimming
// from the oldest segment's own front (segment 0 is the oldest — segments
// are only ever appended, never reordered) so a long-running, on/off/on
// tracked trail still rolls off its oldest points overall rather than only
// ever trimming within whichever segment happens to be current.
function trimTrail(trail, maxPoints) {
  let total = 0;
  for (const segment of trail) total += segment.length;
  while (total > maxPoints && trail.length > 0) {
    const oldest = trail[0];
    if (oldest.length === 0) {
      trail.shift();
      continue;
    }
    oldest.shift();
    total -= 1;
    if (oldest.length === 0) trail.shift();
  }
}

export function stepWorld(world, dt) {
  const p = world.physics;
  const r = world.robot;
  const b = world.ball;

  // --- Robot: rate-limit the commanded velocity, then cap the linear resultant ---
  let cvx = world.command.vx;
  let cvy = world.command.vy;
  const cvt = world.command.vtheta;

  const speed = Math.hypot(cvx, cvy);
  if (speed > p.maxWalkSpeed && speed > 1e-9) {
    const k = p.maxWalkSpeed / speed;
    cvx *= k;
    cvy *= k;
  }

  r.vx = approach(r.vx, cvx, p.maxAccel * dt);
  r.vy = approach(r.vy, cvy, p.maxAccel * dt);
  r.vtheta = approach(r.vtheta, cvt, p.maxAngAccel * dt);

  // Integrate in the field frame. (vx, vy) are robot-frame, so rotate them out.
  const c = Math.cos(r.theta);
  const s = Math.sin(r.theta);
  r.x += (r.vx * c - r.vy * s) * dt;
  r.y += (r.vx * s + r.vy * c) * dt;
  r.theta = Math.atan2(Math.sin(r.theta + r.vtheta * dt), Math.cos(r.theta + r.vtheta * dt));

  // --- Ball: constant-deceleration roll ---
  const bs = Math.hypot(b.vx, b.vy);
  if (bs > 0) {
    const newSpeed = Math.max(0, bs - p.ballDecel * dt);
    if (newSpeed < p.ballStopSpeed) {
      b.vx = 0;
      b.vy = 0;
    } else {
      b.vx = (b.vx / bs) * newSpeed;
      b.vy = (b.vy / bs) * newSpeed;
    }
  }
  b.x += b.vx * dt;
  b.y += b.vy * dt;

  resolveContact(world, dt);

  world.t += dt;
  if (world.trailTracking) {
    // Defensive fallback only — onToggleTrail is what normally opens a new
    // segment the moment tracking resumes. This just keeps stepWorld safe
    // if trailTracking is ever set true with no segment open yet.
    if (world.trail.length === 0) world.trail.push([]);
    const segment = world.trail[world.trail.length - 1];
    const last = segment[segment.length - 1];
    if (!last || Math.hypot(r.x - last[0], r.y - last[1]) > 0.03) {
      segment.push([r.x, r.y]);
      trimTrail(world.trail, 4000);
    }
  }

  checkTermination(world);
  return world;
}

/**
 * Foot/body contact with the ball.
 *
 * The kicking foot sits `stanceBias` to one side and FOOT_FORWARD ahead of the robot
 * centre. When the ball overlaps it, the ball leaves along the contact normal at
 * kickGain x the foot's closing speed, with the scatter/bias/jitter that a real
 * walk-through strike has. Body contact (torso, not foot) just nudges the ball out
 * so the robot cannot stand inside it.
 */
function resolveContact(world, dt) {
  const p = world.physics;
  const r = world.robot;
  const b = world.ball;

  const c = Math.cos(r.theta);
  const s = Math.sin(r.theta);

  // Foot position in the field frame. Sign of the lateral offset follows whichever
  // side the ball is on, which is what the brain's stance_bias logic assumes.
  const ballRobotY = -(b.x - r.x) * s + (b.y - r.y) * c;
  const lateral = ballRobotY >= 0 ? p.stanceBias || 0.06 : -(p.stanceBias || 0.06);
  const footX = r.x + FOOT_FORWARD * c - lateral * s;
  const footY = r.y + FOOT_FORWARD * s + lateral * c;

  const dx = b.x - footX;
  const dy = b.y - footY;
  const dist = Math.hypot(dx, dy);
  const contactDist = BALL_RADIUS + FOOT_HALF_WIDTH + CONTACT_SLOP;

  let struck = false;
  if (dist < contactDist && dist > 1e-6) {
    const nx = dx / dist;
    const ny = dy / dist;

    // Foot velocity in the field frame (body velocity + rotation about the centre).
    const footVx = r.vx * c - r.vy * s - r.vtheta * (footY - r.y);
    const footVy = r.vx * s + r.vy * c + r.vtheta * (footX - r.x);
    // Closing speed of the foot onto the ball, minus whatever the ball is already doing.
    const closing = (footVx - b.vx) * nx + (footVy - b.vy) * ny;

    if (closing > 0.05) {
      const sigma = (p.kickDirSigmaDeg * Math.PI) / 180;
      const baseDir = Math.atan2(ny, nx);
      const dir = baseDir + gaussian(world.rng) * sigma + p.kickDirBias;
      const mag = closing * p.kickGain * (1 + (world.rng() * 2 - 1) * p.kickSpeedJitter);

      b.vx = mag * Math.cos(dir);
      b.vy = mag * Math.sin(dir);
      struck = true;
      world.lastContactT = world.t;
      world.events.push({
        t: world.t,
        type: "strike",
        speed: mag,
        dir,
        errDeg: ((dir - baseDir) * 180) / Math.PI,
      });
    } else {
      // Resting against the foot: separate them so the ball is not dragged along.
      b.x = footX + nx * contactDist;
      b.y = footY + ny * contactDist;
    }
  }

  // Torso collision, rear and sides only -- a ball in front is the foot's business.
  if (!struck) {
    const bdx = b.x - r.x;
    const bdy = b.y - r.y;
    const bdist = Math.hypot(bdx, bdy);
    const bodyDist = BALL_RADIUS + ROBOT_RADIUS;
    const bearing = Math.atan2(-bdx * s + bdy * c, bdx * c + bdy * s);
    if (bdist < bodyDist && bdist > 1e-6 && Math.abs(bearing) > TORSO_CONTACT_CONE) {
      const nx = bdx / bdist;
      const ny = bdy / bdist;
      b.x = r.x + nx * bodyDist;
      b.y = r.y + ny * bodyDist;
      const bodyVx = r.vx * c - r.vy * s;
      const bodyVy = r.vx * s + r.vy * c;
      const closing = bodyVx * nx + bodyVy * ny;
      if (closing > 0) {
        b.vx = nx * closing;
        b.vy = ny * closing;
      }
    }
  }
  void dt;
}

function checkTermination(world) {
  if (world.result) return;
  const b = world.ball;
  const hl = FD.length / 2;
  const hw = FD.width / 2;
  const inMouth = Math.abs(b.y) < FD.goalWidth / 2;

  if (b.x > hl && inMouth) {
    world.result = "goal";
  } else if (b.x < -hl && inMouth) {
    world.result = "own_goal";
  } else if (Math.abs(b.x) > hl + BALL_RADIUS || Math.abs(b.y) > hw + BALL_RADIUS) {
    world.result = "out";
  }
  if (world.result) {
    world.events.push({ t: world.t, type: world.result });
  }
}

/** Ball state expressed in the robot frame, as the brain's BrainData sees it. */
export function ballToRobot(world) {
  const r = world.robot;
  const b = world.ball;
  const dx = b.x - r.x;
  const dy = b.y - r.y;
  const c = Math.cos(r.theta);
  const s = Math.sin(r.theta);
  const x = dx * c + dy * s;
  const y = -dx * s + dy * c;
  return { x, y, range: Math.hypot(dx, dy), yaw: Math.atan2(y, x) };
}

export { clamp };
