import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PanelRight, Play } from "lucide-react";
import Header from "../components/Header.jsx";
import GlassButton, { GlassButtonFilter } from "../components/GlassButton.jsx";
import ArtifactsDrawer, { ArtifactsDrawerFilter } from "../components/ArtifactsDrawer.jsx";
import "../components/CardList.css";
import "./Home.css";

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

export default function Home() {
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    document.title = "Home";
  }, []);

  return (
    <div className="card-page">
      <GlassButtonFilter />
      <ArtifactsDrawerFilter />
      <Header />
      <div className="card-shell">
        <div className="card-shell-inner">
          <span className="card-eyebrow">brain_tree.cpp</span>
          <h1>Home</h1>
          <p className="home-lede">Quick links and resources live here.</p>
          <div className="home-actions">
            <GlassButton
              onClick={() => setDrawerOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={drawerOpen}
            >
              <PanelRight aria-hidden="true" size={16} />
              View Artifacts
            </GlassButton>
            <GlassButton
              variant="accent"
              className="home-run-btn"
              onClick={() => navigate("/robot-simulator")}
            >
              <Play aria-hidden="true" size={16} />
              Run Robot Simulation
            </GlassButton>
          </div>
          <p className="home-resources">More quick links and resources coming soon.</p>
        </div>
      </div>
      <ArtifactsDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        items={artifacts}
      />
    </div>
  );
}
