// The one exponential-approach engine on this route: a value that eases
// toward a target rather than snapping to it, so whatever drives it trails
// the input by a beat the same way a hover state transitions instead of
// swapping instantly. See CLAUDE.md's Motion section.
//
// This has no velocity and cannot overshoot — every frame just closes a
// fraction of the remaining gap. See src/lib/springTether.js for the
// app's other, genuinely physical motion system (real position/velocity/
// spring-force/damping, used by the run console's speed slider) and
// CLAUDE.md's Motion section for why the two are kept deliberately
// distinct rather than treated as interchangeable "easing."
//
// Two things drive a value with it, and they differ only in what sets the
// target — never in how the value gets there:
//   - useScrollScrub.js — the simulate step's physics drawer, target from
//     scroll position, pushed imperatively (scroll fires far more often than
//     the display refreshes, so it may never touch React state).
//   - useEasedApproach below — the landing hero's shot, target from discrete
//     UI state (page entrance, then Load & Check).
//
// Keep both on this implementation rather than letting the algorithm drift
// between them.

import { useEffect, useRef } from "react";

const FALLBACK_TAU_MS = 300;

/**
 * The easing's time constant, taken from --duration-base off a real element
 * rather than invented in JS, so the motion tokens still own the feel.
 * @param {Element} el
 */
export function readTau(el) {
  const raw = window.getComputedStyle(el).getPropertyValue("--duration-base");
  const parsed = parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return FALLBACK_TAU_MS;
  return raw.trim().endsWith("ms") ? parsed : parsed * 1000;
}

export function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * @param {object} options
 * @param {number} options.tau - easing time constant, in ms.
 * @param {number} options.initial - the value at rest before anything drives it.
 * @param {(value: number) => void} options.onFrame - called with the eased value,
 *   once immediately, once per settling frame, and once more on the frame it
 *   reaches the target.
 */
export function createApproach({ tau, initial, onFrame }) {
  let shown = initial;
  let target = initial;
  let frame = 0;
  let previous = 0;

  const tick = (now) => {
    // Exponential approach: the step is a fraction of the remaining gap, so
    // it eases out on its own, never overshoots, and behaves the same at any
    // refresh rate. Clamped because a backgrounded tab hands back one huge
    // delta, which would otherwise snap the value across its whole range.
    const elapsed = previous ? Math.min(now - previous, 100) : 0;
    previous = now;
    shown += (target - shown) * (1 - Math.exp(-elapsed / tau));
    // It approaches without ever arriving; cut it off below a sub-pixel gap
    // so the loop can actually stop.
    if (Math.abs(target - shown) < 0.0005) shown = target;
    onFrame(shown);
    if (shown === target) {
      frame = 0;
      previous = 0;
    } else {
      frame = window.requestAnimationFrame(tick);
    }
  };

  onFrame(shown);

  return {
    // Only ever moves the target — tick() is what writes a value out, once a
    // frame and only while there is a gap left to close.
    setTarget(next) {
      target = next;
      if (!frame) frame = window.requestAnimationFrame(tick);
    },
    // Reduced motion: be at the target, having never travelled to it.
    jumpTo(next) {
      target = next;
      shown = next;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      previous = 0;
      onFrame(shown);
    },
    stop() {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      previous = 0;
    },
  };
}

/**
 * Eases toward a target held in React state. The value starts at `initial`
 * and travels whenever `target` changes — so the trigger is a state change,
 * not a continuous input.
 *
 * @param {React.RefObject<Element>} tauRef - element to read --duration-base
 *   from. Must be mounted for the effect to run.
 * @param {number} target
 * @param {(value: number) => void} onFrame
 * @param {number} initial
 */
export function useEasedApproach(tauRef, target, onFrame, initial = 0) {
  // The frame callback is read through a ref so a parent re-render handing
  // down a new closure never tears the loop down mid-travel.
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;
  const approachRef = useRef(null);

  useEffect(() => {
    const tauEl = tauRef.current;
    if (!tauEl) return undefined;
    const approach = createApproach({
      tau: readTau(tauEl),
      initial,
      onFrame: (value) => onFrameRef.current(value),
    });
    approachRef.current = approach;
    return () => {
      approach.stop();
      approachRef.current = null;
    };
    // `initial` is the resting value at mount only; a later change to it is
    // meaningless and must not rebuild the loop underneath a travel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tauRef]);

  // Declared after the effect above, so approachRef is populated by the time
  // this runs on the first commit — effects fire in hook order.
  useEffect(() => {
    const approach = approachRef.current;
    if (!approach) return;
    if (prefersReducedMotion()) approach.jumpTo(target);
    else approach.setTarget(target);
  }, [target]);
}
