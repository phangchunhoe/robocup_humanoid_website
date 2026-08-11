import { useEffect } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import GlassButton from "./GlassButton.jsx";
import "./ArtifactsDrawer.css";

export function ArtifactsDrawerFilter() {
  return (
    <svg aria-hidden="true" focusable="false" className="artifacts-drawer-filter-defs">
      <filter
        id="artifacts-drawer-glass"
        x="-20%"
        y="-20%"
        width="140%"
        height="140%"
        colorInterpolationFilters="sRGB"
      >
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.007 0.02"
          numOctaves="2"
          seed="7"
          result="turbulence"
        />
        <feGaussianBlur in="turbulence" stdDeviation="2.5" result="blurredNoise" />
        <feDisplacementMap
          in="SourceGraphic"
          in2="blurredNoise"
          scale="20"
          xChannelSelector="R"
          yChannelSelector="B"
        />
      </filter>
    </svg>
  );
}

export default function ArtifactsDrawer({ open, onClose, items }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (evt) => {
      if (evt.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  return (
    <>
      <div
        className={`artifacts-drawer-scrim${open ? " is-open" : ""}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={`artifacts-drawer${open ? " is-open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Strategy artifacts"
        aria-hidden={!open}
      >
        <div className="artifacts-drawer-header">
          <span className="artifacts-drawer-label">Artifacts</span>
          <GlassButton
            className="artifacts-drawer-close"
            aria-label="Close artifacts drawer"
            onClick={onClose}
            tabIndex={open ? 0 : -1}
          >
            <X aria-hidden="true" size={16} />
          </GlassButton>
        </div>
        <nav className="artifacts-drawer-list">
          {items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="artifacts-drawer-item"
              onClick={onClose}
              tabIndex={open ? 0 : -1}
            >
              <span className="artifacts-drawer-item-title">{item.title}</span>
              <span className="artifacts-drawer-item-desc">{item.desc}</span>
            </Link>
          ))}
        </nav>
      </aside>
    </>
  );
}
