import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Play } from "lucide-react";
import Header from "../components/Header.jsx";
import GlassButton from "../components/GlassButton.jsx";
import "../components/CardList.css";
import "./Home.css";

export default function Home() {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Home";
  }, []);

  return (
    <div className="card-page">
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
          <p className="home-resources">More quick links and resources coming soon.</p>
        </div>
      </div>
    </div>
  );
}
