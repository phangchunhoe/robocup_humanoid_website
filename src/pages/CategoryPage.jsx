import { useEffect } from "react";
import { Link } from "react-router-dom";
import Header from "../components/Header.jsx";
import "../components/CardList.css";

export default function CategoryPage({ title, description, items = [] }) {
  useEffect(() => {
    document.title = `${title} — Strategy Artifacts`;
  }, [title]);

  return (
    <div className="card-page">
      <Header />
      <div className="card-shell">
        <div className="card-shell-inner">
          <span className="card-eyebrow">brain_tree.cpp</span>
          <h1>{title}</h1>
          {description && <p className="card-page-desc">{description}</p>}
          {items.length > 0 ? (
            <ul className="card-grid">
              {items.map((it) => (
                <li key={it.to}>
                  <Link className="card" to={it.to}>
                    <span className="card-title">{it.title}</span>
                    <span className="card-desc">{it.desc}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="card-empty">No artifacts here yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
