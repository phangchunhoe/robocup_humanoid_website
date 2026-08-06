import { useLayoutEffect, useEffect, useRef } from "react";
import {
  motion,
  useAnimationControls,
  useMotionValue,
  useSpring,
  useTransform,
  useReducedMotion,
} from "framer-motion";
import { SPRING_CLICK } from "../lib/motionSpring.js";
import { PILL_TAP_SCALE } from "./GlassButton.jsx";
import { useSpringTether } from "../lib/springTether.js";
import "./GlassSlider.css";

// Tuning for the thumb's own spring-physics tether — see CLAUDE.md -> Motion
// -> Spring-physics tether, and springTether.js's own header, for why this
// is a real mass-spring-damper simulation (position, velocity, force,
// damping) rather than a framer-motion `type: "spring"` transition or this
// app's rAF eased-follow engine.
//   - HOME is the anchored option's own pull — the dominant, always-present
//     force (the engine's fixed "primary" stiffness, set once here). While
//     the cursor is still within the anchor's own zone, this is strong
//     enough that the cursor's pull barely moves the thumb off it.
//   - CURSOR is the cursor's own pull, toggled on only while tethered (the
//     engine's "secondary" target) — deliberately weak relative to HOME, so
//     on its own it can drift the thumb a little (visible tension building)
//     but can never win the equilibrium by itself. It never wins gradually
//     either: the moment the cursor's raw position crosses out of the
//     anchor's own zone, handleMouseMove drops this force entirely and
//     retargets HOME itself at the new zone — a discrete snap, not the two
//     forces slowly trading places.
//   - DAMPING/MASS are shared by both forces. Against HOME alone (its usual
//     state — tethered CURSOR is weak, and a snap drops it to zero) the
//     damping ratio here works out underdamped — enough for one small,
//     quick overshoot on a snap or a release, nowhere near an actual water
//     droplet's wobble.
const TETHER_HOME_STIFFNESS = 620;
// ~25x weaker than HOME (was ~9x) — the thumb needs to feel planted for
// most of the anchor's own zone width, not just resistant near its centre;
// this is what makes the pre-snap give small and slow to build rather than
// an easy, near-immediate drift. The actual hand-off is still the discrete
// zone-crossing snap below, not a gradual force crossover — weakening this
// further shrinks how far that give reaches, it doesn't move where the snap
// itself triggers.
const TETHER_CURSOR_STIFFNESS = 25;
const TETHER_DAMPING = 31;
const TETHER_MASS = 0.6;

// Squash-and-stretch, read live off the tether's own velocity rather than a
// separate animation: STRETCH_PER_VELOCITY converts px/s into a 0..1 "pull"
// amount (clamped at 1), which STRETCH_MAX/SQUASH_RATIO then turn into a
// scaleX/scaleY pair. Passed through SPRING_CLICK (already tuned snappy,
// reused rather than inventing a fourth spring config for one more value) so
// the stretch itself eases in and out instead of popping.
const STRETCH_PER_VELOCITY = 0.0016;
const STRETCH_MAX = 0.12;
const SQUASH_RATIO = 0.6;

/**
 * The glass-thumb-in-a-track pattern — see CLAUDE.md -> Components -> Glass
 * slider. A segmented control for a small, fixed set of equal-width options
 * whose active state is one physical glass surface (GlassButton's own
 * material: droplet fill, shared turbulence wobble, rim edge) that behaves
 * like it's on an elastic tether to the cursor while hovered, and settles
 * onto whichever option is committed otherwise — rather than each option
 * self-styling when active (that's the plain `SegmentedControl`) or an
 * organically-measured neutral pane (that's `RoleToggle`, scoped to exactly
 * one two-way case). The run console's playback speed is the reference case
 * this was built for.
 *
 * Three motions, from three different systems, on one element:
 *   - Position (`x`) is a genuine spring-physics tether
 *     (`useSpringTether`, `src/lib/springTether.js`) — not this app's rAF
 *     eased-follow engine (`easedApproach.js`, used by the hero shot and the
 *     physics drawer) and not a framer-motion spring transition. While the
 *     cursor sits within the *anchored* option's own zone, the thumb is
 *     pulled by two simultaneous spring forces of very different strength:
 *     a dominant pull toward that option's own centre (HOME), and a weak
 *     tug toward the cursor's raw position (CURSOR) — see the
 *     TETHER_HOME_STIFFNESS/TETHER_CURSOR_STIFFNESS comment below. The
 *     thumb settles near the equilibrium of the two, which stays close to
 *     HOME (a small, felt drift, not a follow) for as long as the cursor
 *     stays inside that zone. The moment the cursor's raw position crosses
 *     into a *different* zone (see `handleMouseMove`'s own comment), that
 *     is a discrete snap, not a gradual handoff: CURSOR is dropped
 *     entirely and HOME's own target jumps straight to the new zone's
 *     centre, so the spring's already-live momentum carries it into a
 *     visible overshoot before it settles — a real physical consequence of
 *     the simulation, not a separately triggered "bounce" animation. The
 *     same snap happens on `mouseleave` (targeting the true committed slot)
 *     and on a click or keyboard commit (targeting whatever was just
 *     selected) — but unlike `mouseleave`, a commit does not stop the
 *     tether: if the pointer is still over the track, CURSOR simply
 *     re-engages relative to the newly-committed anchor on the very next
 *     move, the same as any other snap. `handleSelect` only ever updates
 *     *which* option is anchored; whether the cursor is currently able to
 *     tug at it is `followingRef`'s job alone, driven strictly by
 *     `mouseenter`/`mouseleave`.
 *   - Squash-and-stretch (`scaleX`/`scaleY`) is read live off that same
 *     simulation's velocity, gated to zero whenever the track isn't
 *     hovered, and smoothed through a quick framer-motion spring
 *     (`SPRING_CLICK`) so it eases rather than snaps in and out.
 *   - The click bounce (`scale`, independent of the squash-stretch
 *     scaleX/scaleY above) is `SPRING_CLICK` at GlassButton's own
 *     `PILL_TAP_SCALE` — the same spring/magnitude every individual
 *     GlassButton gets from its own `whileTap`. It can't be a `whileTap`
 *     here, because the pointer press lands on whichever label sits on top
 *     of the thumb, not on the thumb itself, so it's triggered imperatively
 *     through `useAnimationControls` instead, sequenced up then back down.
 *
 * `x`/`scaleX`/`scaleY` are raw motion values (the first written every
 * settling frame by the spring-tether engine, the other two derived from it
 * via `useTransform`); `scale` is framer-driven through
 * `useAnimationControls`. All are independent motion values on the same
 * element, combined into one `transform` by framer-motion automatically —
 * the same composition GlassButton's own `style={{ x, y }}` +
 * `whileHover`/`whileTap` already relies on.
 *
 * No DOM measurement of the thumb itself, unlike `RoleToggle`'s sliding
 * pill: the thumb's width is pure CSS (percentage of the track), and its
 * pixel value — needed for the tether's clamp bounds and for computing each
 * option's slot centre — is derived analytically from the *track's* own
 * measured width and the option count, not by reading the thumb's own
 * rendered box.
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
  // handlers below, so neither has to be rebuilt (and the running tether
  // torn down and restarted) every time a parent re-render hands down new
  // prop identities.
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;
  const optionCountRef = useRef(options.length);
  optionCountRef.current = options.length;

  // Track-geometry facts the tether math needs, refreshed by measure()
  // rather than measured inline on every mousemove. thumbWidth is derived
  // from the track's own clientWidth (which, since the track has no
  // padding, already excludes its border) and the option count — the same
  // formula the CSS `width: calc(...)` on the thumb resolves, computed here
  // in JS because the tether needs it as a number.
  const boundsRef = useRef({ borderLeft: 0, space1: 4, innerWidth: 0, thumbWidth: 0 });
  // Handed to the spring engine directly (a ref, read fresh every substep —
  // see springTether.js) so a resize doesn't require tearing the engine down.
  const clampBoundsRef = useRef({ min: 0, max: 0 });
  // Which option's slot the tether currently resists toward. Starts equal
  // to the committed speed, and only ever changes while genuinely hovering
  // (a zone crossing — see handleMouseMove) or resets back to the committed
  // speed on mouseleave/commit. Distinct from `activeIndex`/`value`: hover
  // can move this without ever changing the actual selection.
  const anchorIndexRef = useRef(activeIndex);
  // Whether the cursor is currently over the track at all. A mousemove
  // alone, without a preceding mouseenter, is never trusted (defensive: it
  // shouldn't fire without one, but this keeps the tether from ever
  // engaging on a stale/synthetic event).
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
    clampBoundsRef.current = { min: 0, max: Math.max(0, innerWidth - space1 * 2 - thumbWidth) };
  };

  // Squash-and-stretch — see this file's own top comment and the STRETCH_*
  // constants above.
  const pullRaw = useMotionValue(0);
  const pullSmoothed = useSpring(pullRaw, SPRING_CLICK);
  const scaleX = useTransform(pullSmoothed, (p) => 1 + p * STRETCH_MAX);
  const scaleY = useTransform(pullSmoothed, (p) => 1 - p * STRETCH_MAX * SQUASH_RATIO);

  const tetherRef = useSpringTether(
    0,
    (x, v) => {
      xMotionValue.set(x);
      pullRaw.set(followingRef.current ? Math.min(1, Math.abs(v) * STRETCH_PER_VELOCITY) : 0);
    },
    // The engine's fixed "primary" stiffness is HOME's — always present,
    // always dominant. CURSOR is the "secondary" target, toggled on/off and
    // given its own (weak) stiffness per call — see handleMouseMove.
    { stiffness: TETHER_HOME_STIFFNESS, damping: TETHER_DAMPING, mass: TETHER_MASS },
    clampBoundsRef
  );

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
    tetherRef.current.jumpTo(x);

    // A resize can change the track's width (the HUD column is itself
    // fluid, clamp(320px, 26vw, 420px)) — re-measure and re-anchor
    // instantly; this is a layout correction, not something that should
    // play the spring travel.
    const onResize = () => {
      measure();
      const nextX = restX(activeIndexRef.current);
      xMotionValue.set(nextX);
      tetherRef.current.jumpTo(nextX);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keeps the resting position in sync with `value` for any change that
  // didn't already move the thumb itself as part of committing (handleSelect
  // already does this directly; this is the reactive safety net for an
  // external value change, e.g. a future consumer driving `value` from
  // outside this control). Guarded on `followingRef` so it can't yank the
  // target out from under a live tether.
  useEffect(() => {
    if (followingRef.current) return;
    anchorIndexRef.current = activeIndex;
    const x = restX(activeIndex);
    if (reduceMotion) {
      xMotionValue.set(x);
      tetherRef.current.jumpTo(x);
    } else {
      tetherRef.current.setSecondaryTarget(null);
      tetherRef.current.setPrimaryTarget(x);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, reduceMotion]);

  const handleSelect = (option, index) => {
    onChange(option.id);
    // Deliberately does NOT touch followingRef: a click only ever fires
    // while the pointer is over one of the labels, which is inside the
    // track, so if a hover session is already live (the normal case),
    // it stays live straight through the commit. Setting it false here
    // used to be how "the thumb locks until hovered again" worked, but
    // that silently disabled handleMouseMove for good afterward whenever
    // the cursor never actually left the track — its early-return guard
    // (`if (!followingRef.current) return`) had no other way back to
    // `true` short of a genuine mouseleave/mouseenter pair. The anchor
    // update below is what makes the click "stick" now; the cursor is
    // simply free to keep tugging at whatever anchor is current, exactly
    // as it could before the click.
    anchorIndexRef.current = index;
    const x = restX(index);
    if (reduceMotion) {
      xMotionValue.set(x);
      tetherRef.current.jumpTo(x);
      return;
    }
    // Drops CURSOR entirely and retargets HOME at the clicked slot — the
    // same snap handleMouseMove's zone-crossing triggers, just from a
    // commit instead. Whatever velocity the tether already had carries
    // into the spring's own natural overshoot. If the pointer is still
    // over the track, the very next mousemove re-engages CURSOR relative
    // to this same (now-updated) anchor, same as any other snap.
    tetherRef.current.setSecondaryTarget(null);
    tetherRef.current.setPrimaryTarget(x);
    scaleControls.start({ scale: PILL_TAP_SCALE, transition: SPRING_CLICK }).then(() => {
      scaleControls.start({ scale: 1, transition: SPRING_CLICK });
    });
  };

  // The live tether. Two regimes, chosen fresh on every move by comparing
  // the cursor's raw zone against the current anchor — never a gradual
  // crossover between them:
  //   - TETHERED (cursor still within the anchor's own zone): HOME keeps
  //     targeting the anchor's centre at its full (dominant) stiffness, and
  //     CURSOR is turned on, targeting the cursor's own clamped position at
  //     TETHER_CURSOR_STIFFNESS. The thumb settles near HOME's target —
  //     CURSOR alone is far too weak to pull it the rest of the way — with
  //     just enough real displacement (and, via the velocity it takes to
  //     get there, squash-and-stretch) to read as tension building.
  //   - SNAP (the cursor's raw position has just crossed into a *different*
  //     zone): the anchor updates to that zone, CURSOR is dropped outright
  //     (`setSecondaryTarget(null)`), and HOME's own target jumps straight
  //     to the new zone's centre. There is no blending step — the old
  //     anchor's pull is simply gone the instant the new one takes its
  //     place — and whatever velocity the thumb already had carries into
  //     the spring's natural overshoot as HOME alone reels it the rest of
  //     the way in. The very next move, with the cursor now inside that
  //     new zone, falls straight back into TETHERED relative to it — a snap
  //     is a single-frame event, not a mode that has to be explicitly
  //     exited.
  // This never fires an actual commit — only a click or keyboard selection
  // (handleSelect) changes `value` itself.
  const handleMouseMove = (evt) => {
    if (!followingRef.current) return;
    const track = trackRef.current;
    if (!track) return;
    const { borderLeft, space1, innerWidth, thumbWidth } = boundsRef.current;
    const trackRect = track.getBoundingClientRect();
    const localX = evt.clientX - trackRect.left - borderLeft;

    const zoneWidth = innerWidth / optionCountRef.current;
    const cursorZone = Math.min(
      optionCountRef.current - 1,
      Math.max(0, Math.floor(localX / zoneWidth))
    );

    if (cursorZone !== anchorIndexRef.current) {
      anchorIndexRef.current = cursorZone;
      tetherRef.current.setSecondaryTarget(null);
      tetherRef.current.setPrimaryTarget(restX(anchorIndexRef.current));
      return;
    }

    const maxTranslate = Math.max(0, innerWidth - space1 * 2 - thumbWidth);
    const cursorTarget = Math.min(maxTranslate, Math.max(0, localX - thumbWidth / 2 - space1));
    tetherRef.current.setPrimaryTarget(restX(anchorIndexRef.current));
    tetherRef.current.setSecondaryTarget(cursorTarget, TETHER_CURSOR_STIFFNESS);
  };

  const handleMouseEnter = () => {
    followingRef.current = true;
    // Every hover session starts tethered to the true committed speed, not
    // wherever a previous session (that ended without a click) happened to
    // leave the anchor.
    anchorIndexRef.current = activeIndexRef.current;
    tetherRef.current.setPrimaryTarget(restX(activeIndexRef.current));
  };

  const handleMouseLeave = () => {
    followingRef.current = false;
    anchorIndexRef.current = activeIndexRef.current;
    tetherRef.current.setSecondaryTarget(null);
    tetherRef.current.setPrimaryTarget(restX(activeIndexRef.current));
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
          scaleX,
          scaleY,
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
