import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";
import "./GlassModal.css";

/**
 * The app's one glass modal shell — extracted from TestCard.jsx's own
 * overlay/portal/inert/Escape logic so every glass popup (the test-card
 * description modal, and the Approach & Kick Time test flow) is visibly and
 * structurally the same pattern, not just similar-looking CSS. See
 * CLAUDE.md -> Components -> "reuse the existing tile-expand visual pattern".
 *
 * Portaled straight to <body>, unconditionally rendered by the caller (i.e.
 * the caller passes `isOpen`, it never conditionally mounts <GlassModal>
 * itself) — a freshly-mounted backdrop-filter (doubly so with the drawer's
 * own SVG turbulence filter layered on top) doesn't composite in the same
 * frame its opacity starts animating in Chromium, so content would read as
 * arriving before the blur behind it "caught up" a beat later. Keeping the
 * element permanently in the render tree means the very first paint of this
 * backdrop-filter happens invisibly, well before the user's first open.
 *
 * `closable` gates Escape, outside-click, and (by omission) any close
 * button the caller renders inside its own children — the running stage of
 * the Approach & Kick Time flow sets this false so a test in progress can't
 * be dismissed out from under itself.
 */
export default function GlassModal({ isOpen, onClose, closable = true, ariaLabel, className = "", children }) {
  const reduceMotion = useReducedMotion();
  const overlayRef = useRef(null);

  useEffect(() => {
    if (!isOpen || !closable) return undefined;
    const onKeyDown = (evt) => {
      if (evt.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, closable, onClose]);

  // See TestCard's own original comment on why `.inert` is set imperatively
  // rather than passed as a React prop (React 18 doesn't recognize it as a
  // real boolean HTML attribute).
  useEffect(() => {
    if (overlayRef.current) overlayRef.current.inert = !isOpen;
  }, [isOpen]);

  return createPortal(
    <div
      ref={overlayRef}
      className={`glass-modal-overlay${isOpen ? " is-open" : ""}`}
      onClick={closable ? onClose : undefined}
    >
      <motion.div
        className={`glass-modal${className ? ` ${className}` : ""}`}
        initial={false}
        animate={isOpen ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        role="dialog"
        aria-modal={isOpen}
        aria-label={ariaLabel}
        onClick={(evt) => evt.stopPropagation()}
      >
        {children}
      </motion.div>
    </div>,
    document.body,
  );
}
