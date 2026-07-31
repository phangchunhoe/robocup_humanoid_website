import { useEffect } from "react";
import { Link } from "react-router-dom";
import Header from "../components/Header.jsx";
import "../components/CardList.css";

const sections = [
  {
    to: "/striker-strategy",
    title: "Striker Strategy",
    desc: "How the striker chases the ball, curves in behind it, and decides when to kick.",
  },
  {
    to: "/goalie-strategy",
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
];

export default function Home() {
  useEffect(() => {
    document.title = "Strategy Artifacts";
  }, []);

  return (
    <div className="card-page">
      <Header />
      <div className="card-shell">
        <div className="card-shell-inner">
          <span className="card-eyebrow">brain_tree.cpp</span>
          <h1>Strategy Artifacts</h1>
          <ul className="card-grid">
            {sections.map((s) => (
              <li key={s.to}>
                <Link className="card" to={s.to}>
                  <span className="card-title">{s.title}</span>
                  <span className="card-desc">{s.desc}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
