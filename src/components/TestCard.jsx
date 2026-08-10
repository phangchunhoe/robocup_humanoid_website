import { useState } from "react";
import { X } from "lucide-react";
import GlassButton from "./GlassButton.jsx";
import GlassModal from "./GlassModal.jsx";
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
 * Entrance), at --ease-out rather than a spring. Its own duration runs a
 * little longer than --duration-base (450ms, not 300ms) — this card is a
 * lot bigger and more central than InfoHint's small popover, so the same
 * timing that reads as a quick, incidental reveal there read as abrupt here.
 *
 * Built on <GlassModal> (src/components/GlassModal.jsx) — the shared glass
 * modal shell every glass popup in this app now goes through, rather than
 * this component carrying its own bespoke portal/overlay/inert/Escape
 * logic. GlassModal is itself always mounted regardless of `isOpen` (see its
 * own doc comment on why); this component still tracks `lastId` so the
 * modal always has real content sitting inside it to paint, even while
 * closed, instead of an empty box.
 */
export default function TestCard({ tests, onStart = () => {} }) {
  const [activeId, setActiveId] = useState(null);
  const [lastId, setLastId] = useState(tests[0]?.id ?? null);
  const isOpen = activeId !== null;
  const shownTest = tests.find((test) => test.id === (activeId ?? lastId)) || null;

  const open = (id) => {
    setLastId(id);
    setActiveId(id);
  };
  const close = () => setActiveId(null);

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

      <GlassModal isOpen={isOpen} onClose={close} ariaLabel={shownTest?.title} className="test-card-modal">
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
              onClick={() => {
                // Starting a test from inside the description modal hands off
                // to that test's own flow (e.g. ApproachKickTestFlow) — this
                // modal has to close first, or the two would sit stacked.
                close();
                onStart(shownTest);
              }}
            >
              Start
            </GlassButton>
          </>
        ) : null}
      </GlassModal>
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
