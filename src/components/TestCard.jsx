import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import GlassButton from "./GlassButton.jsx";
import "./TestCard.css";

// A named, scoped magnetic-pull tuning for the Start button's own shape
// class — a small pill, so it earns a bit more reach/pull than GlassButton's
// own PILL_* defaults (GlassButton.jsx) before it reads as elastic rather
// than loose (CLAUDE.md -> Motion -> Spring-based controls: tune per control
// shape, not per instance).
const START_BUTTON_REACH_PX = 26;
const START_BUTTON_PULL_PX = 7;
const START_BUTTON_PULL_STRENGTH = 0.18;

/**
 * The Testing tab's card list — one row per test definition (see
 * src/content/testDefinitions.js), expanding into a full-detail overlay on
 * click. The overlay carries no darkening scrim (the field and console stay
 * fully visible behind it); only the modal's own translucent glass separates
 * it from what's behind it, and it just fades and rises into place — the
 * same "fade + slight upward movement" recipe every other click-triggered
 * overlay in this app uses (InfoHint's own popover; CLAUDE.md -> Motion ->
 * Entrance), at --duration-base/--ease-out rather than a spring.
 *
 * The overlay is portaled straight to <body> once, unconditionally, rather
 * than mounted/unmounted per open — see the comment above it for why: a
 * freshly-mounted backdrop-filter (doubly so with an SVG turbulence filter
 * layered on top, url(#rs-drawer-glass)) doesn't composite in the same frame
 * its opacity starts animating in Chromium, so the card's content read as
 * arriving before the blur behind it "caught up" a beat later. Keeping the
 * element permanently in the render tree — same shape as .rs-console-face's
 * own always-mounted, cross-faded faces — means the very first time this
 * backdrop-filter is ever painted happens invisibly, well before the user's
 * first click, so by the time isOpen flips true there's nothing left to
 * warm up: only its opacity/position actually change.
 */
export default function TestCard({ tests, onStart = () => {} }) {
  const [activeId, setActiveId] = useState(null);
  const [lastId, setLastId] = useState(tests[0]?.id ?? null);
  const reduceMotion = useReducedMotion();
  const isOpen = activeId !== null;
  // Falls back to the last test shown rather than null while closed, so the
  // modal always has real content sitting inside it to paint (and warm the
  // backdrop-filter against) instead of an empty box.
  const shownTest = tests.find((test) => test.id === (activeId ?? lastId)) || null;

  const open = (id) => {
    setLastId(id);
    setActiveId(id);
  };
  const close = () => setActiveId(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (evt) => {
      if (evt.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  // React 18's JSX attribute handling doesn't recognize `inert` as a real
  // boolean HTML attribute — passing inert={!isOpen} as a prop logs "Received
  // `true`/`false` for a non-boolean attribute" and never actually writes it
  // to the DOM (confirmed against a real build). Setting the element's own
  // `.inert` IDL property directly sidesteps that and is exactly what the
  // attribute would have done: closed buttons can't silently steal keyboard
  // focus or get announced to assistive tech.
  const overlayRef = useRef(null);
  useEffect(() => {
    if (overlayRef.current) overlayRef.current.inert = !isOpen;
  }, [isOpen]);

  return (
    <div className="test-card-list">
      <ul className="test-card-ul">
        {tests.map((test) => (
          <TestListItem
            key={test.id}
            test={test}
            onOpen={() => open(test.id)}
            onStart={() => onStart(test)}
          />
        ))}
      </ul>

      {/* Portaled straight to <body>, unconditionally (see the component's
          own doc comment for why) — and because .rs-run-console (.rs-hud)
          sets its own backdrop-filter, which — like a CSS transform — makes
          it the containing block for any position: fixed descendant
          (CLAUDE.md documents this exact ancestor-trap category for
          transform; Chromium applies the same rule to filter/
          backdrop-filter). Without the portal this overlay renders confined
          to the console panel instead of the viewport.

          The `.inert` DOM property (set imperatively above, see that
          comment) is what makes "always mounted" safe from a focus/
          assistive-tech standpoint. It does *not* stop the fixed,
          full-viewport box itself from being hit-tested first, though —
          confirmed against a real build: inert alone still left the
          underlying page unclickable, since the browser still resolves it
          as the topmost element at that point even though it won't dispatch
          the click. The `.is-open` class's `pointer-events` is what
          actually makes it click-through while closed. */}
      {createPortal(
        <div
          ref={overlayRef}
          className={`test-card-overlay${isOpen ? " is-open" : ""}`}
          onClick={close}
        >
          <motion.div
            className="test-card-modal"
            initial={false}
            animate={isOpen ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            role="dialog"
            aria-modal={isOpen}
            aria-label={shownTest?.title}
            onClick={(evt) => evt.stopPropagation()}
          >
            {shownTest ? (
              <>
                <button type="button" className="test-card-modal-close" aria-label="Close" onClick={close}>
                  <X aria-hidden="true" />
                </button>

                <h3 className="test-card-modal-title">{shownTest.title}</h3>
                <p className="test-card-modal-sm">{shownTest.sm}</p>
                <p className="test-card-modal-description">{shownTest.description}</p>

                <GlassButton
                  variant="glass"
                  className="test-card-start"
                  reach={START_BUTTON_REACH_PX}
                  pull={START_BUTTON_PULL_PX}
                  strength={START_BUTTON_PULL_STRENGTH}
                  onClick={() => onStart(shownTest)}
                >
                  Start
                </GlassButton>
              </>
            ) : null}
          </motion.div>
        </div>,
        document.body,
      )}
    </div>
  );
}

function TestListItem({ test, onOpen, onStart }) {
  const onKeyDown = (evt) => {
    if (evt.key === "Enter" || evt.key === " ") {
      evt.preventDefault();
      onOpen();
    }
  };

  return (
    <li className="test-card" role="button" tabIndex={0} onClick={onOpen} onKeyDown={onKeyDown}>
      <div className="test-card-body">
        <h3 className="test-card-title">{test.title}</h3>
        <p className="test-card-sm">{test.sm}</p>
      </div>
      <GlassButton
        variant="glass"
        className="test-card-start"
        reach={START_BUTTON_REACH_PX}
        pull={START_BUTTON_PULL_PX}
        strength={START_BUTTON_PULL_STRENGTH}
        onClick={(evt) => {
          evt.stopPropagation();
          onStart();
        }}
      >
        Start
      </GlassButton>
    </li>
  );
}
