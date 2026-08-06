// Spring-physics tether: a genuine mass-spring-damper simulation — position,
// velocity, spring force, damping, integrated frame by frame — not the
// exponential eased-follow engine in easedApproach.js and not a
// framer-motion `type: "spring"` transition. See CLAUDE.md's Motion section
// for why this is documented as its own, third motion system rather than a
// variant of either of the other two.
//
// The eased-follow engine (easedApproach.js) approaches a single target by
// closing a fraction of the remaining gap every frame — it has no velocity,
// can't overshoot, and two of them can't be summed. This engine is a real
// physical system: it carries momentum, can be pulled by *two* independent
// targets at once (a primary and an optional secondary, each with its own
// stiffness, both damped by one shared term), and can overshoot and
// oscillate before settling — which is what a "tethered, then released"
// feel needs and an exponential approach structurally cannot produce.
//
// One call site today: GlassSlider.jsx's thumb, tethered simultaneously to
// the cursor (primary) and its last-committed slot (secondary, weaker) while
// hovered, with the secondary force dropped and the primary target snapped
// to a single fixed slot on release (a click, a keyboard commit, or the
// cursor leaving the track).

import { useEffect, useRef } from "react";

// Below this position error and this speed, treat the system as settled —
// a real spring never mathematically reaches its target, only approaches it
// asymptotically, so this is what lets the rAF loop actually stop.
const SETTLE_DISTANCE = 0.05;
const SETTLE_SPEED = 0.02;

// Caps how large a single integration step is allowed to be. A plain,
// undamped-looking explicit Euler step can go numerically unstable (or
// outright diverge) if dt is too large relative to the spring's own
// timescale (~sqrt(mass / stiffness)) — a backgrounded tab resuming after
// seconds away is exactly that case. Rather than clamp the whole frame's
// elapsed time the way easedApproach.js does (safe for an exponential decay,
// not safe here), a large gap is walked forward in several small, stable
// substeps instead.
const MAX_SUBSTEP_MS = 1000 / 120;
const MAX_FRAME_MS = 100;

/**
 * @param {object} options
 * @param {number} options.stiffness - primary target's spring constant.
 * @param {number} options.damping - shared damping coefficient (resists velocity).
 * @param {number} options.mass
 * @param {number} options.initial - starting position.
 * @param {(x: number, v: number) => void} options.onFrame - called with the
 *   current position and velocity, once immediately and once per settling
 *   frame after that.
 * @param {{current: {min: number, max: number} | null}} [options.boundsRef] -
 *   read fresh every substep (a ref, not a plain value) since the track can
 *   be measured/re-measured after this engine is created — position is
 *   clamped and velocity zeroed in the clamped direction (an inelastic
 *   wall) whenever it's set, rather than only clamping the target and
 *   letting an overshoot render outside it.
 */
export function createSpringTether({ stiffness, damping, mass, initial, onFrame, boundsRef }) {
  let x = initial;
  let v = 0;
  let primaryTarget = initial;
  let secondaryTarget = null;
  let secondaryStiffness = 0;
  let frame = 0;
  let previous = 0;

  const clamp = () => {
    const bounds = boundsRef && boundsRef.current;
    if (!bounds) return;
    if (x < bounds.min) {
      x = bounds.min;
      if (v < 0) v = 0;
    } else if (x > bounds.max) {
      x = bounds.max;
      if (v > 0) v = 0;
    }
  };

  const substep = (dtSeconds) => {
    let force = stiffness * (primaryTarget - x);
    if (secondaryTarget !== null) {
      force += secondaryStiffness * (secondaryTarget - x);
    }
    force -= damping * v;
    const a = force / mass;
    v += a * dtSeconds;
    x += v * dtSeconds;
    clamp();
  };

  // The point this system is actually resting toward isn't primaryTarget
  // when a secondary pull is also active — it's wherever the two spring
  // forces cancel out. Settling against that equilibrium (rather than only
  // ever checking secondaryTarget === null) is what lets the loop idle once
  // a tethered thumb has genuinely caught up with a cursor that has stopped
  // moving, instead of spinning a rAF callback forever until the next
  // release.
  const equilibrium = () => {
    if (secondaryTarget === null) return primaryTarget;
    const totalK = stiffness + secondaryStiffness;
    return totalK === 0 ? x : (stiffness * primaryTarget + secondaryStiffness * secondaryTarget) / totalK;
  };
  const isSettled = () => Math.abs(equilibrium() - x) < SETTLE_DISTANCE && Math.abs(v) < SETTLE_SPEED;

  const tick = (now) => {
    const elapsedMs = previous ? Math.min(now - previous, MAX_FRAME_MS) : 0;
    previous = now;
    let remaining = elapsedMs;
    while (remaining > 0) {
      const stepMs = Math.min(remaining, MAX_SUBSTEP_MS);
      substep(stepMs / 1000);
      remaining -= stepMs;
    }
    if (isSettled()) {
      // Snap to the equilibrium, not necessarily primaryTarget — while a
      // secondary pull is still active, that's the point actually being
      // approached (see equilibrium()'s own comment).
      x = equilibrium();
      v = 0;
      onFrame(x, v);
      frame = 0;
      previous = 0;
      return;
    }
    onFrame(x, v);
    frame = window.requestAnimationFrame(tick);
  };

  const ensureRunning = () => {
    if (!frame) frame = window.requestAnimationFrame(tick);
  };

  onFrame(x, v);

  return {
    // The cursor's pull, or a committed slot's pull once nothing else is
    // tethering the thumb — always present.
    setPrimaryTarget(next) {
      primaryTarget = next;
      ensureRunning();
    },
    // The last-committed slot's resistance while tethered. `strength` is
    // this target's own stiffness — deliberately a separate, usually
    // weaker, spring constant from the primary's, which is what reads as
    // "weighted toward the old position" rather than an equal tug-of-war.
    // Pass `null` to drop it (a release).
    setSecondaryTarget(next, strength = 0) {
      secondaryTarget = next;
      secondaryStiffness = next === null ? 0 : strength;
      ensureRunning();
    },
    // Reduced motion / initial mount: be at the target, with no velocity,
    // having never travelled to it.
    jumpTo(next) {
      x = next;
      v = 0;
      primaryTarget = next;
      secondaryTarget = null;
      secondaryStiffness = 0;
      clamp();
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      previous = 0;
      onFrame(x, v);
    },
    stop() {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      previous = 0;
    },
  };
}

const NOOP_API = { setPrimaryTarget() {}, setSecondaryTarget() {}, jumpTo() {} };

/**
 * Lifecycle wrapper: builds the engine once per mount, tears it down on
 * unmount, hands the caller back a stable ref-held API to drive
 * imperatively — a caller like GlassSlider needs several different event
 * handlers (mousemove, mouseleave, a commit) to be able to push new targets
 * at any time, not one single wired-up event source, so this stays a thin
 * lifecycle shim rather than trying to own that policy itself.
 *
 * @param {number} initial
 * @param {(x: number, v: number) => void} onFrame
 * @param {{stiffness: number, damping: number, mass: number}} spring
 * @param {{current: {min: number, max: number} | null}} [boundsRef] - a ref
 *   the caller keeps updated (e.g. from its own measure()/resize handling);
 *   read fresh every substep, so it does not need to be known yet at mount.
 */
export function useSpringTether(initial, onFrame, spring, boundsRef) {
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;
  const apiRef = useRef(NOOP_API);

  useEffect(() => {
    const tether = createSpringTether({
      ...spring,
      initial,
      boundsRef,
      onFrame: (x, v) => onFrameRef.current(x, v),
    });
    apiRef.current = tether;
    return () => {
      tether.stop();
      apiRef.current = NOOP_API;
    };
    // `initial`/`spring`/`boundsRef` seed the engine at mount only, the same
    // rule useEasedApproach's `initial` follows — later changes must not
    // rebuild the loop underneath a live tether.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return apiRef;
}
