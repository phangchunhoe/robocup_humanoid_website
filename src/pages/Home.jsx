import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Play, ExternalLink } from "lucide-react";
import Header from "../components/Header.jsx";
import GlassButton from "../components/GlassButton.jsx";
import { resources } from "../content/homeLinks.js";
import "../components/CardList.css";
import "./Home.css";

export default function Home() {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Home";
  }, []);

  return (
    <div className="card-page home-page">
      <Header />
      <div className="card-shell">
        <div className="card-shell-inner">
          <span className="card-eyebrow">brain_tree.cpp</span>
          <h1>Home</h1>
          <p className="home-lede">Quick links and resources live here.</p>
          <div className="home-actions">
            <GlassButton
              variant="glass"
              className="home-run-btn"
              onClick={() => navigate("/robot-simulator")}
            >
              <Play aria-hidden="true" size={14} />
              Run Simulation
            </GlassButton>
          </div>
          <div className="home-resources">
            <h2 className="home-resources-heading">Quick Links &amp; Resources</h2>
            <ul className="home-resources-list">
              {resources.map((r) => (
                <li key={r.href}>
                  <a
                    className="home-resource-tile"
                    href={r.href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <span className="home-resource-text">
                      <span className="home-resource-title">{r.title}</span>
                      <span className="home-resource-url">{new URL(r.href).hostname}</span>
                    </span>
                    <ExternalLink
                      aria-hidden="true"
                      size={16}
                      className="home-resource-icon"
                    />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
