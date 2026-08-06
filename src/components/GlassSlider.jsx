import { useEffect, useLayoutEffect, useRef } from "react";
import { motion, useAnimationControls, useMotionValue, useReducedMotion } from "framer-motion";
import { SPRING_CLICK } from "../lib/motionSpring.js";
import { PILL_TAP_SCALE } from "./GlassButton.jsx";
import { usePointerApproach } from "../lib/usePointerApproach.js";
import "./GlassSlider.css";

/**
 * The glass-thumb-in-a-track pattern — see CLAUDE.md -> Components -> Glass
 * slider. A segmented control for a small, fixed set of equal-width
 * options whose active state is one physical glass surface (GlassButton's
 * own material: droplet fill, shared turbulence wobble, rim edge) that
 * follows the cursor while hovered and settles onto whichever option is
 * active otherwise — rather than each option self-styling when active
 * (that's the plain `SegmentedControl`) or an organically-measured neutral
 * pane (that's `RoleToggle`, scoped to exactly one two-way case). The run
 * console's playback speed is the reference case this was built for.
 *
 * Three motions, from two different systems, on one element:
 *   - Position (`x`) is the eased-follow/rAF engine (see CLAUDE.md ->
 *     Motion -> Eased-follow elements) — the same one driving the hero
 *     field's shot and the physics drawer's slide, extended here to a third
 *     driver (`usePointerApproach`, alongside `useScrollScrub` and
 *     `useEasedApproach` in easedApproach.js), and tightened to
 *     `--duration-fast` rather than the engine's default `--duration-base`
 *     (see `readTau`'s own comment in easedApproach.js) so it visibly keeps
 *     pace with the cursor instead of trailing at the same unhurried rate
 *     as those two. While the cursor is over the track, mousemove
 *     continuously re-targets it — but to the *centre of whichever option's
 *     zone the cursor is currently over* (see `handleMouseMove`'s own
 *     comment), not to the cursor's literal x-position, so what's
 *     continuous is the *motion*, not the target: the thumb still only
 *     ever eases toward one of the fixed slot centres, the same ones a
 *     click or keyboard selection commits to, and that target simply
 *     updates live as the cursor crosses between zones. On mouseleave (or
 *     once a selection is committed) the target becomes the active
 *     option's slot instead. This is still a continuous input driving an
 *     eased value, unlike the discrete tween an even earlier version of
 *     this control used, so it belongs on this engine rather than a CSS
 *     transition.
 *   - The click bounce (`scale`) is `SPRING_CLICK` at GlassButton's own
 *     `PILL_TAP_SCALE` — the same spring/magnitude every individual
 *     GlassButton gets from its own `whileTap`. It can't be a `whileTap`
 *     here, because the pointer press lands on whichever label sits on top
 *     of the thumb, not on the thumb itself, so it's triggered imperatively
 *     through `useAnimationControls` instead, sequenced up then back down.
 * `x` (a raw `useMotionValue`, written every settling frame by the
 * eased-follow engine) and `scale` (framer-driven, via `useAnimationControls`)
 * are two independent motion values on the same element, combined into one
 * `transform` by framer-motion automatically — the same composition
 * GlassButton's own `style={{ x, y }}` + `whileHover`/`whileTap` already
 * relies on. Neither ever fights a raw CSS `transition: transform`, because
 * there isn't one here.
 *
 * No DOM measurement of the thumb itself, unlike `RoleToggle`'s sliding
 * pill: the thumb's width is pure CSS (percentage of the track), and its
 * pixel value — needed for computing each option's resting slot, which the
 * cursor-follow zone detection also resolves to — is derived analytically
 * from the *track's* own measured width and the option count, not by
 * reading the thumb's own rendered box.
 *
 * @param {{id: string, label: string}[]} options
 * @param {string} value - id of the active option
 * @param {(id: string) => void} onChange
 * @param {string} ariaLabel
 */
export default function GlassSlider({ options, value, onChange, ariaLabel }) {
  const trackRef = useRef(null);
  const scaleControls = useAnimationControls();
  const xMotionValue = useMotionValue(0);
  const reduceMotion = useReducedMotion();
  const activeIndex = Math.max(0, options.findIndex((o) => o.id === value));

  // Read through refs by the mount-only layout effect and the event
  // handlers below, so neither has to be rebuilt (and the running approach
  // torn down and restarted) every time a parent re-render hands down new
  // prop identities.
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;
  const optionCountRef = useRef(options.length);
  optionCountRef.current = options.length;

  // Track-geometry facts the pointer math needs, refreshed by measure()
  // rather than measured inline on every mousemove. thumbWidth is derived
  // from the track's own clientWidth (which, since the track has no
  // padding, already excludes its border) and the option count — the same
  // formula the CSS `width: calc(...)` on the thumb resolves, computed here
  // in JS because the pointer-follow clamp needs it as a number.
  const boundsRef = useRef({ borderLeft: 0, space1: 4, innerWidth: 0, thumbWidth: 0 });
  // Whether the cursor is currently "holding" the thumb. Starts false (nothing
  // has been hovered yet); a click or a mouseleave sets it false again and it
  // is only set true by a genuine mouseenter — a mousemove alone, without an
  // intervening leave, does not resume following after a click. That is what
  // gives the post-click position its "stays there until hovered again" hold.
  const followingRef = useRef(false);

  const restX = (index) => index * boundsRef.current.thumbWidth;

  const measure = () => {
    const track = trackRef.current;
    if (!track) return;
    const cs = window.getComputedStyle(track);
    const borderLeft = parseFloat(cs.borderLeftWidth) || 0;
    const space1 = parseFloat(cs.getPropertyValue("--space-1")) || 4;
    const innerWidth = track.clientWidth;
    const thumbWidth = Math.max(0, innerWidth - space1 * 2) / optionCountRef.current;
    boundsRef.current = { borderLeft, space1, innerWidth, thumbWidth };
  };

  // --duration-fast, not the engine's default --duration-base: the target
  // here is a continuous, live cursor position rather than a discrete state
  // change, and needs to visibly keep pace with it rather than trail at the
  // same unhurried rate the hero shot/physics drawer use — see readTau's own
  // comment in easedApproach.js.
  const approachRef = usePointerApproach(trackRef, 0, (v) => xMotionValue.set(v), "--duration-fast");

  // Measures and lands the thumb on its resting slot before the first
  // paint — a layout effect rather than a plain effect (unlike this file's
  // sibling patterns, e.g. RoleToggle, which instead simply doesn't render
  // its pill until a regular effect has measured it) because here the
  // *track* itself, not just the moving piece, always renders, so there is
  // nothing to gate on; running synchronously before paint is what avoids a
  // flash from x:0 to the real resting slot instead.
  useLayoutEffect(() => {
    measure();
    const x = restX(activeIndexRef.current);
    xMotionValue.set(x);
    approachRef.current.jumpTo(x);

    // A resize can change the track's width (the HUD column is itself
    // fluid, clamp(320px, 26vw, 420px)) — re-measure and re-anchor
    // instantly; this is a layout correction, not something that should
    // play the eased travel.
    const onResize = () => {
      measure();
      const nextX = restX(activeIndexRef.current);
      xMotionValue.set(nextX);
      approachRef.current.jumpTo(nextX);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keeps the resting position in sync with `value` for any change that
  // didn't already move the thumb itself as part of committing — keyboard
  // selection, most notably. Guarded on `followingRef` so an external value
  // change arriving while the cursor is actively holding the thumb (a
  // future consumer driving `value` from outside this control) can't yank
  // the target out from under a live follow.
  useEffect(() => {
    if (followingRef.current) return;
    const x = restX(activeIndex);
    if (reduceMotion) {
      xMotionValue.set(x);
      approachRef.current.jumpTo(x);
    } else {
      approachRef.current.setTarget(x);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, reduceMotion]);

  const handleSelect = (option, index) => {
    onChange(option.id);
    // Locks the thumb at this option's centre and holds it there — see
    // followingRef's own comment for what "holds" means.
    followingRef.current = false;
    const x = restX(index);
    if (reduceMotion) {
      xMotionValue.set(x);
      approachRef.current.jumpTo(x);
      return;
    }
    approachRef.current.setTarget(x);
    scaleControls.start({ scale: PILL_TAP_SCALE, transition: SPRING_CLICK }).then(() => {
      scaleControls.start({ scale: 1, transition: SPRING_CLICK });
    });
  };

  // Snaps to whichever option's own zone the cursor is currently over,
  // rather than centering the thumb on the cursor's literal position: the
  // *target* handed to the eased-follow engine is always one of the fixed
  // slot centres (restX(index), the same formula a click or a keyboard
  // selection commits to), never a free-floating x. Each option
  // (.glass-slider-option) is an equal 1/3-of-the-track flex slot, so
  // dividing the track's own measured width into that many equal zones and
  // floor-dividing the cursor's position into one of them reproduces
  // exactly those slots — the boundary between zone i and i+1 sits at the
  // midpoint between slot i's and slot i+1's centres, which is what makes
  // the live target flip at "crosses the midpoint between two labels," not
  // at some other threshold. The engine still eases toward whichever
  // target this resolves to — it's the target that's now discrete, not the
  // motion.
  const handleMouseMove = (evt) => {
    if (!followingRef.current) return;
    const track = trackRef.current;
    if (!track) return;
    const { borderLeft, innerWidth } = boundsRef.current;
    const trackRect = track.getBoundingClientRect();
    const localX = evt.clientX - trackRect.left - borderLeft;
    const zoneWidth = innerWidth / optionCountRef.current;
    const index = Math.min(
      optionCountRef.current - 1,
      Math.max(0, Math.floor(localX / zoneWidth))
    );
    approachRef.current.setTarget(restX(index));
  };

  const handleMouseEnter = () => {
    followingRef.current = true;
  };

  const handleMouseLeave = () => {
    followingRef.current = false;
    approachRef.current.setTarget(restX(activeIndexRef.current));
  };

  const handleKeyDown = (evt) => {
    const lastIndex = options.length - 1;
    let nextIndex = null;
    if (evt.key === "ArrowRight" || evt.key === "ArrowDown") {
      nextIndex = activeIndex >= lastIndex ? 0 : activeIndex + 1;
    } else if (evt.key === "ArrowLeft" || evt.key === "ArrowUp") {
      nextIndex = activeIndex <= 0 ? lastIndex : activeIndex - 1;
    } else if (evt.key === "Home") {
      nextIndex = 0;
    } else if (evt.key === "End") {
      nextIndex = lastIndex;
    }
    if (nextIndex === null) return;
    evt.preventDefault();
    handleSelect(options[nextIndex], nextIndex);
    const buttons = evt.currentTarget.querySelectorAll("[role='radio']");
    if (buttons[nextIndex]) buttons[nextIndex].focus();
  };

  return (
    <div
      ref={trackRef}
      className="glass-slider"
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      onMouseMove={reduceMotion ? undefined : handleMouseMove}
      onMouseEnter={reduceMotion ? undefined : handleMouseEnter}
      onMouseLeave={reduceMotion ? undefined : handleMouseLeave}
    >
      <motion.div
        className="glass-slider-thumb"
        aria-hidden="true"
        style={{
          width: `calc((100% - var(--space-1) * 2) / ${options.length})`,
          x: xMotionValue,
        }}
        animate={scaleControls}
        initial={false}
      />
      {options.map((option, index) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            className={`glass-slider-option${active ? " is-active" : ""}`}
            onClick={() => handleSelect(option, index)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
