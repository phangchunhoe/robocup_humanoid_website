// Headless test engine for the Testing tab's "Approach & Kick Time" tile.
//
// Runs 36 approach angles x 3 repeats (108 runs total) against the striker
// program, entirely off-screen: no <svg>, no renderer, no real-time pacing.
// SimRuntime.tick(world) and stepWorld(world, dt) (runtime.js, physics.js)
// are pure, instance-scoped functions with no shared/global state, so this
// reuses the exact same reset() path the app's own Reset button and role
// switch already rely on (runtime.reset(role)) rather than rebuilding a
// fresh SimHost/SimRuntime per run -- see runtime.js's own reset().
//
// "Start play" has no literal name in the state machine; per the agreed
// design, the stopwatch starts on the first tick whose decision is "chase"
// or "adjust", and stops on the first tick whose decision is "kick" or
// "cross" (runtime.js:500-521). A run that never reaches kick/cross within
// MAX_TICKS_PER_RUN is recorded as timed out rather than hanging the batch.

import { buildProgram } from "./runtime.js";
import { createWorld, stepWorld, DEFAULT_PHYSICS } from "./physics.js";
import { FIXED_DT } from "./engine.js";

export const ANGLE_STEP_DEG = 10;
export const REPEATS = 3;
export const BATCH_SIZE = 5;
export const MAX_TICKS_PER_RUN = 3000; // 30 simulated seconds

const APPROACH_DECISIONS = new Set(["chase", "adjust"]);
const KICK_DECISIONS = new Set(["kick", "cross"]);

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

/**
 * One robot placement for `angleDeg` around the ball, at `radiusM`. The
 * robot always faces the ball -- the swept parameter is position on the
 * circle, not heading.
 */
export function placementFor(angleDeg, radiusM, ballX, ballY) {
  const rad = toRad(angleDeg);
  const rx = ballX + radiusM * Math.cos(rad);
  const ry = ballY + radiusM * Math.sin(rad);
  const theta = Math.atan2(ballY - ry, ballX - rx);
  return { robot: { x: rx, y: ry, theta }, ball: { x: ballX, y: ballY } };
}

/**
 * The ordered 108-run plan, batched 5-wide within each repeat round (all
 * batches of repeat 0, then all of repeat 1, then repeat 2), matching the
 * "5 concurrent slots filled from the same repeat round" ordering spec.
 * Batching here is a progress/yield unit for the headless driver below, not
 * real parallel rendering -- see the plan's own execution-model note.
 * Returns an array of batches, each an array of run descriptors.
 */
export function generateTestPlan({
  radiusM,
  ballX = 0,
  ballY = 0,
  repeats = REPEATS,
  angleStepDeg = ANGLE_STEP_DEG,
  batchSize = BATCH_SIZE,
  baseSeed,
}) {
  const angleCount = Math.round(360 / angleStepDeg);
  const angles = Array.from({ length: angleCount }, (_, i) => i * angleStepDeg);
  const batches = [];
  let runIndex = 0;
  for (let repeatIndex = 0; repeatIndex < repeats; repeatIndex += 1) {
    for (let b = 0; b < angles.length; b += batchSize) {
      const batch = angles.slice(b, b + batchSize).map((angleDeg) => {
        const run = {
          runIndex,
          angleDeg,
          repeatIndex,
          // Distinct per run -- with the same seed and identical initial
          // conditions, repeats of the same angle would be byte-identical
          // (physics.js's makeRng is a deterministic PRNG), defeating the
          // point of repeating.
          seed: baseSeed + runIndex,
          initial: placementFor(angleDeg, radiusM, ballX, ballY),
        };
        runIndex += 1;
        return run;
      });
      batches.push(batch);
    }
  }
  return batches;
}

/**
 * Tick one run to completion against an already-reset `runtime`/fresh
 * `world`. Mirrors RobotSimulator.jsx's own onStep tick order exactly
 * (runtime.tick -> copy host.command onto world -> stepWorld) so decisions
 * are read against the same world state the live run step would show.
 */
export function runOneCase(runtime, world, maxTicks = MAX_TICKS_PER_RUN) {
  let startTick = null;
  for (let tick = 0; tick < maxTicks; tick += 1) {
    if (world.result) return { elapsedSec: null, timedOut: true };

    const telemetry = runtime.tick(world);
    if (runtime.error) return { elapsedSec: null, timedOut: true };

    const decision = telemetry.decision;
    if (startTick === null && (APPROACH_DECISIONS.has(decision) || KICK_DECISIONS.has(decision))) {
      // The KICK_DECISIONS branch is the degenerate fallback documented in
      // the plan: a run placed close enough to open directly in kick/cross
      // starts its own clock at tick 0 rather than never starting at all.
      startTick = tick;
    }
    if (startTick !== null && KICK_DECISIONS.has(decision)) {
      return { elapsedSec: (tick - startTick) * FIXED_DT, timedOut: false };
    }

    world.command = runtime.host.command;
    stepWorld(world, FIXED_DT);
  }
  return { elapsedSec: null, timedOut: true };
}

/**
 * Drives the full 108-run batch headlessly. `sources`/`physicsSnapshot` are
 * exactly the app's own state (RobotSimulator.jsx) -- the striker program
 * text and the physics drawer's current values, snapshotted once by the
 * caller so the whole batch stays internally comparable. `onProgress(completed,
 * total)` fires after every individual run; the loop yields to the browser
 * between batches so the progress bar repaints and the nav guards stay live.
 */
export async function runApproachKickTest({
  sources,
  physicsSnapshot,
  radiusM,
  ballX = 0,
  ballY = 0,
  jitterEnabled = false,
  onProgress,
}) {
  const built = buildProgram({
    cppText: sources.cpp,
    xmlText: sources.xml.striker,
    headerText: sources.header,
    role: "striker",
  });
  if (!built.ok) {
    return { ok: false, report: built.report, results: null };
  }

  const runtime = built.runtime;
  const baseSeed = (physicsSnapshot && physicsSnapshot.seed) || DEFAULT_PHYSICS.seed;
  const plan = generateTestPlan({ radiusM, ballX, ballY, baseSeed });
  const totalRuns = plan.reduce((n, batch) => n + batch.length, 0);

  const byAngle = new Map(); // angleDeg -> { runs: (number|null)[], timedOutCount }
  let completed = 0;

  for (const batch of plan) {
    for (const run of batch) {
      runtime.reset("striker");
      // The realistic FOV/range/confidence/jitter perception model (120°
      // cone, "Ball jitter intensity") is engaged only when the setup form's
      // "Ball jitter" toggle is on -- the same usePreciseBall switch the run
      // step's own "Limit Ball Vision" pill flips. Off (the default) leaves
      // SimHost's ground-truth ball tracking in place, so the sweep measures
      // pure approach/kick timing with no vision noise.
      runtime.host.usePreciseBall = !jitterEnabled;

      const world = createWorld(run.initial, { ...physicsSnapshot, seed: run.seed });
      const { elapsedSec, timedOut } = runOneCase(runtime, world);

      if (!byAngle.has(run.angleDeg)) byAngle.set(run.angleDeg, { runs: [], timedOutCount: 0 });
      const entry = byAngle.get(run.angleDeg);
      entry.runs.push(timedOut ? null : elapsedSec);
      if (timedOut) entry.timedOutCount += 1;

      completed += 1;
      if (onProgress) onProgress(completed, totalRuns);
    }
    // eslint-disable-next-line no-await-in-loop -- deliberate: yields once per
    // batch so the browser can repaint between them, not per run.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  const results = Array.from(byAngle.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([angleDeg, entry]) => {
      const completedRuns = entry.runs.filter((v) => v !== null);
      const avgTimeSec =
        completedRuns.length > 0 ? completedRuns.reduce((s, v) => s + v, 0) / completedRuns.length : null;
      return { angleDeg, avgTimeSec, runs: entry.runs, timedOutCount: entry.timedOutCount };
    });

  return { ok: true, report: built.report, results };
}
