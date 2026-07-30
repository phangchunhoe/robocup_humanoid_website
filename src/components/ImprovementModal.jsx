import { useEffect } from "react";
import areasForImprovement from "../content/areasForImprovement.js";
import "./ImprovementModal.css";

export default function ImprovementModal({ open, onClose }) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="improve-modal-backdrop" onClick={onClose}>
      <div
        className="improve-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Areas for improvement"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="improve-modal-head">
          <h2>Areas for Improvement</h2>
          <button
            type="button"
            className="improve-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="improve-modal-body">
          {areasForImprovement.map((group) => (
            <section key={group.section} className="improve-group">
              <h3>{group.section}</h3>
              <ul>
                {group.items.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
