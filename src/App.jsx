import { HashRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home.jsx";
import CategoryPage from "./pages/CategoryPage.jsx";
import BezierAnatomy from "./pages/BezierAnatomy.jsx";
import LongRangePreview from "./pages/LongRangePreview.jsx";
import strikerStrategyItems from "./content/strikerStrategyItems.js";

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route
          path="/striker-strategy"
          element={
            <CategoryPage
              title="Striker Strategy"
              description="How the striker chases the ball, curves in behind it, and decides when to kick."
              items={strikerStrategyItems}
            />
          }
        />
        <Route
          path="/goalie-strategy"
          element={
            <CategoryPage
              title="Goalie Strategy"
              description="Positioning, diving, and shot-stopping logic for the goalkeeper node."
            />
          }
        />
        <Route
          path="/freekick-strategy"
          element={
            <CategoryPage
              title="All of the Freekicks Strategy"
              description="Set-piece routines for direct and indirect free kicks."
            />
          }
        />
        <Route
          path="/communication-nodes"
          element={
            <CategoryPage
              title="Communication Nodes"
              description="Inter-robot messaging and role coordination."
            />
          }
        />
        <Route path="/anatomy" element={<BezierAnatomy />} />
        <Route path="/long-range-preview" element={<LongRangePreview />} />
      </Routes>
    </HashRouter>
  );
}
