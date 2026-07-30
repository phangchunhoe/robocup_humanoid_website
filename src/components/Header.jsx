import { useState } from "react";
import { Link } from "react-router-dom";
import ImprovementModal from "./ImprovementModal.jsx";
import "./Header.css";

export default function Header() {
  const [showImprovements, setShowImprovements] = useState(false);

  return (
    <>
      <header className="site-header">
        <Link to="/" className="site-header-home">
          ← Home
        </Link>
        <button
          type="button"
          className="site-header-improve-btn"
          onClick={() => setShowImprovements(true)}
        >
          Areas for Improvement
        </button>
      </header>
      <ImprovementModal open={showImprovements} onClose={() => setShowImprovements(false)} />
    </>
  );
}
