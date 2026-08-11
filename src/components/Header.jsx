import { useState } from "react";
import { Link } from "react-router-dom";
import { PanelRight } from "lucide-react";
import ImprovementModal from "./ImprovementModal.jsx";
import GlassButton, { GlassButtonFilter } from "./GlassButton.jsx";
import ArtifactsDrawer, { ArtifactsDrawerFilter } from "./ArtifactsDrawer.jsx";
import "./Header.css";

const artifacts = [
  {
    to: "/striker-strategy",
    title: "Striker Strategy",
    desc: "How the striker chases the ball, curves in behind it, and decides when to kick.",
  },
  {
    to: "/goalie-explorer",
    title: "Goalie Strategy",
    desc: "Positioning, diving, and shot-stopping logic for the goalkeeper node.",
  },
  {
    to: "/freekick-explorer",
    title: "All of the Freekicks Strategy",
    desc: "Set-piece routines for direct and indirect free kicks.",
  },
  {
    to: "/team-comm-byte-format",
    title: "Team Communication",
    desc: "The fixed 16-byte UDP packet robots broadcast to coordinate roles, ball belief, and the goalkeeper handoff.",
  },
  {
    to: "/robot-simulator",
    title: "Robot Simulator",
    desc: "Paste brain_tree.cpp and watch it run: one robot chasing, adjusting and kicking a real ball in real time, driven by the interpreted C++ itself.",
  },
];

export default function Header() {
  const [showImprovements, setShowImprovements] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      <GlassButtonFilter />
      <ArtifactsDrawerFilter />
      <header className="site-header">
        <Link to="/" className="site-header-home">
          ← Home
        </Link>
        <div className="site-header-actions">
          <button
            type="button"
            className="site-header-improve-btn"
            onClick={() => setShowImprovements(true)}
          >
            Areas for Improvement
          </button>
          <GlassButton
            className="site-header-artifacts-btn"
            onClick={() => setDrawerOpen(true)}
            aria-label="View artifacts"
            aria-haspopup="dialog"
            aria-expanded={drawerOpen}
          >
            <PanelRight aria-hidden="true" size={14} />
          </GlassButton>
        </div>
      </header>
      <ImprovementModal open={showImprovements} onClose={() => setShowImprovements(false)} />
      <ArtifactsDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} items={artifacts} />
    </>
  );
}
