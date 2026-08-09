import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import GlassButton from "./GlassButton.jsx";
import { SPRING_UI } from "../lib/motionSpring.js";
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
 * click via a framer-motion shared layoutId transition (CLAUDE.md ->
 * Motion -> Spring-based controls: SPRING_UI is the same config RoleToggle's
 * sliding pill and the two-stage button's own `layout` prop already use for
 * a measured-layout settle). The list item stays mounted the whole time —
 * the modal is a second element sharing its layoutId, and framer-motion
 * animates between the two automatically.
 */
export default function TestCard({ tests, onStart = () => {} }) {
  const [activeId, setActiveId] = useState(null);
  const reduceMotion = useReducedMotion();
  const activeTest = tests.find((test) => test.id === activeId) || null;

  const close = () => setActiveId(null);

  useEffect(() => {
    if (!activeTest) return undefined;
    const onKeyDown = (evt) => {
      if (evt.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeTest]);

  return (
    <div className="test-card-list">
      <ul className="test-card-ul">
        {tests.map((test) => (
          <TestListItem
            key={test.id}
            test={test}
            onOpen={() => setActiveId(test.id)}
            onStart={() => onStart(test)}
          />
        ))}
      </ul>

      {/* Portal wraps AnimatePresence (not the other way around): the
          portal's target is always <body>, and AnimatePresence's own child
          mounts/unmounts conditionally inside it. AnimatePresence clones its
          direct child to inject animation props, and a React portal object
          isn't a regular element — putting createPortal() *inside*
          AnimatePresence silently breaks that cloning, so the modal never
          commits to the DOM. Portaled straight to <body> because
          .rs-run-console (.rs-hud) sets its own backdrop-filter, which —
          like a CSS transform — makes it the containing block for any
          position: fixed descendant (CLAUDE.md documents this exact
          ancestor-trap category for transform; Chromium applies the same
          rule to filter/backdrop-filter). Without the portal this scrim
          renders confined to the console panel instead of the viewport. */}
      {createPortal(
        <AnimatePresence>
          {activeTest ? (
            <motion.div
              className="test-card-scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.3 }}
              onClick={close}
            >
              <motion.div
                className="test-card-modal rs-glass"
                layoutId={`test-card-${activeTest.id}`}
                transition={reduceMotion ? { duration: 0 } : SPRING_UI}
                role="dialog"
                aria-modal="true"
                aria-label={activeTest.title}
                onClick={(evt) => evt.stopPropagation()}
              >
                <button type="button" className="test-card-modal-close" aria-label="Close" onClick={close}>
                  <X aria-hidden="true" />
                </button>

                <motion.h3 className="test-card-modal-title" layoutId={`test-title-${activeTest.id}`}>
                  {activeTest.title}
                </motion.h3>
                <motion.p className="test-card-modal-sm" layoutId={`test-sm-${activeTest.id}`}>
                  {activeTest.sm}
                </motion.p>
                <p className="test-card-modal-description">{activeTest.description}</p>

                <GlassButton
                  variant="glass"
                  className="test-card-start"
                  reach={START_BUTTON_REACH_PX}
                  pull={START_BUTTON_PULL_PX}
                  strength={START_BUTTON_PULL_STRENGTH}
                  onClick={() => onStart(activeTest)}
                >
                  Start
                </GlassButton>
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>,
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
    <motion.li
      className="test-card"
      layoutId={`test-card-${test.id}`}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={onKeyDown}
    >
      <div className="test-card-body">
        <motion.h3 className="test-card-title" layoutId={`test-title-${test.id}`}>
          {test.title}
        </motion.h3>
        <motion.p className="test-card-sm" layoutId={`test-sm-${test.id}`}>
          {test.sm}
        </motion.p>
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
    </motion.li>
  );
}
