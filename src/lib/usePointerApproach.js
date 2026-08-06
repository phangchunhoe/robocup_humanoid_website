// Pointer-approach: the third driver on the shared exponential-approach
// engine in easedApproach.js, after scroll (useScrollScrub.js, the physics
// drawer) and discrete React state (useEasedApproach, the hero shot). See
// that file's own header for the engine itself and why all drivers stay on
// one implementation rather than letting the algorithm drift between them.
//
// Unlike the other two, what sets the target here isn't one single event
// source the hook can wire up itself — it's a mix of continuous pointer
// movement and discrete commits (a click, a keyboard selection), and the
// policy for which one wins at a given moment is specific to the caller
// (GlassSlider.jsx, currently the one call site: follow the cursor while
// hovering, settle to the active slot on mouseleave or on a commit, and
// stay settled until the pointer enters again). So this hook does the
// minimum both other drivers already do internally — build the engine once
// per mount, read its time constant off a real element, tear it down on
// unmount — and hands the caller back a stable, ref-held API to drive
// imperatively from its own event handlers instead.

import { useEffect, useRef } from "react";
import { createApproach, readTau } from "./easedApproach.js";

const NOOP_API = { setTarget() {}, jumpTo() {} };

/**
 * @param {React.RefObject<Element>} tauRef - element to read the tau token from.
 *   Must be mounted for the effect to run.
 * @param {number} initial - the value before any interaction.
 * @param {(value: number) => void} onFrame
 * @param {string} [tauToken] - passed straight through to readTau; defaults
 *   to --duration-base there. GlassSlider passes --duration-fast, since its
 *   target is a continuous, live cursor position rather than a discrete
 *   state change, and wants to visibly catch up rather than trail.
 * @returns {React.RefObject<{setTarget(next: number): void, jumpTo(next: number): void}>}
 */
export function usePointerApproach(tauRef, initial, onFrame, tauToken) {
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;
  const apiRef = useRef(NOOP_API);

  useEffect(() => {
    const tauEl = tauRef.current;
    if (!tauEl) return undefined;
    const approach = createApproach({
      tau: readTau(tauEl, tauToken),
      initial,
      onFrame: (value) => onFrameRef.current(value),
    });
    apiRef.current = approach;
    return () => {
      approach.stop();
      apiRef.current = NOOP_API;
    };
    // `initial` seeds the engine at mount only, same as useEasedApproach —
    // a later change to it is meaningless and must not rebuild the loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tauRef, tauToken]);

  return apiRef;
}
