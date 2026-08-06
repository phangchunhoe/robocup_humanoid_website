import { useEffect, useRef } from "react";
import { motion, useMotionValue, useSpring, useReducedMotion } from "framer-motion";
import { SPRING_MAGNETIC, SPRING_CLICK } from "../lib/motionSpring.js";
import { applyMagneticPull } from "../lib/magneticPull.js";
import "./GlassButton.css";

// Magnetic-droplet pull tuning for GlassButton's own pill/icon shape family —
// a third named set alongside RobotSimulator.jsx's BACK_BUTTON_*/LEGEND_*
// constants (same convention: tune per control "shape class", not per
// individual instance). Weaker than the 44px circular back button's own
// values, the same reasoning the legend already documents: a wider surface
// dragged by the same pull magnitude reads as loose rather than elastic. A
// caller that wants the exact back-button feel (the back button itself, once
// migrated onto this component) still can — every constant is a prop.
const PILL_REACH_PX = 22;
const PILL_PULL_PX = 5;
const PILL_PULL_STRENGTH = 0.14;
const PILL_HOVER_SCALE = 1.03;
// Exported: GlassSlider.jsx reuses this exact magnitude for its thumb's
// click bounce, so a speed option moving into a segmented slider keeps the
// identical "bounce a bit bigger" feedback it had as a standalone
// GlassButton rather than drifting to a second, slightly-different number.
export const PILL_TAP_SCALE = 1.07;

export const GLASS_BUTTON_FILTER_ID = "glass-button-noise";

// The shared liquid-glass wobble every GlassButton references through
// backdrop-filter: url(#glass-button-noise) — see CLAUDE.md -> Surfaces ->
// Exception 4. Render this exactly once per page; SVG filters are addressed
// by id, so every button instance can point at the same definition rather
// than each carrying its own copy. Tuned identically to the run step's
// former bespoke back-button filter: every GlassButton instance sits at
// roughly that same ~44px-tall scale, not the wide-bar or full-panel
// surfaces that earned their own bespoke tuning (the legend's expanded key,
// the physics drawer).
export function GlassButtonFilter() {
  return (
    <svg aria-hidden="true" focusable="false" className="glass-btn-filter-defs">
      <filter
        id={GLASS_BUTTON_FILTER_ID}
        x="-20%"
        y="-20%"
        width="140%"
        height="140%"
        colorInterpolationFilters="sRGB"
      >
        <feTurbulence type="fractalNoise" baseFrequency="0.015 0.04" numOctaves="2" seed="3" result="turbulence" />
        <feGaussianBlur in="turbulence" stdDeviation="1.5" result="blurredNoise" />
        <feDisplacementMap in="SourceGraphic" in2="blurredNoise" scale="16" xChannelSelector="R" yChannelSelector="B" />
      </filter>
    </svg>
  );
}

/**
 * The app's canonical liquid-glass interactive control — see CLAUDE.md ->
 * Components -> Glass button. Same material and motion everywhere it
 * appears: a droplet fill wobbled by the shared turbulence filter above, a
 * magnetic lean toward the cursor, and a spring click bounce
 * (SPRING_MAGNETIC / SPRING_CLICK, the same pair the run step's back button
 * and legend use). Two fills — "glass" (translucent droplet) and "accent"
 * (opaque --color-accent, for the one dominant action in a row) — and an
 * optional `selected` state standing in for a segmented control's active
 * segment. Variants differ by fill only, never by structure or motion.
 *
 * Each instance owns its own mousemove listener rather than joining the
 * HUD's single shared one (see RobotSimulator.jsx's back-button/legend
 * effect) — that consolidation exists to keep a small, fixed set of bespoke
 * controls off a per-control listener. A reusable component has no fixed
 * control count to consolidate against, and this listener only ever reads a
 * pointer position into a motion value — it never triggers a re-render — so
 * one more costs nothing next to the win of a fully self-contained control.
 */
export default function GlassButton({
  variant = "glass",
  selected = false,
  reach = PILL_REACH_PX,
  pull = PILL_PULL_PX,
  strength = PILL_PULL_STRENGTH,
  hoverScale = PILL_HOVER_SCALE,
  tapScale = PILL_TAP_SCALE,
  className = "",
  children,
  ...rest
}) {
  const ref = useRef(null);
  const reduceMotion = useReducedMotion();
  const pullX = useMotionValue(0);
  const pullY = useMotionValue(0);
  const springX = useSpring(pullX, SPRING_MAGNETIC);
  const springY = useSpring(pullY, SPRING_MAGNETIC);

  useEffect(() => {
    if (reduceMotion) return undefined;
    const handleMove = (evt) => applyMagneticPull(ref.current, evt, reach, pull, strength, pullX, pullY);
    window.addEventListener("mousemove", handleMove);
    return () => window.removeEventListener("mousemove", handleMove);
  }, [reduceMotion, reach, pull, strength, pullX, pullY]);

  const classes = [
    "glass-btn",
    `glass-btn--${variant}`,
    selected ? "is-selected" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <motion.button
      ref={ref}
      type="button"
      className={classes}
      // No transform transition in CSS — framer-motion owns the button's
      // transform outright (magnetic x/y spring, hover scale, click bounce).
      style={reduceMotion ? undefined : { x: springX, y: springY }}
      whileHover={
        reduceMotion
          ? { scale: 1.02, transition: { duration: 0 } }
          : { scale: hoverScale, transition: SPRING_MAGNETIC }
      }
      whileTap={
        reduceMotion
          ? { scale: 0.96, transition: { duration: 0 } }
          : { scale: tapScale, transition: SPRING_CLICK }
      }
      {...rest}
    >
      {children}
    </motion.button>
  );
}
