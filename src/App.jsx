import { HashRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home.jsx";
import CategoryPage from "./pages/CategoryPage.jsx";
import BezierAnatomy from "./pages/BezierAnatomy.jsx";
import LongRangePreview from "./pages/LongRangePreview.jsx";
import FreekickExplorer from "./pages/FreekickExplorer.jsx";
import TeamCommByteFormat from "./pages/TeamCommByteFormat.jsx";
import strikerStrategyItems from "./content/strikerStrategyItems.js";
import freekickStrategyItems from "./content/freekickStrategyItems.js";

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
              description="Set-piece routines for direct/indirect free kicks, throw-ins, goal kicks, and corner kicks."
              items={freekickStrategyItems}
            />
          }
        />
        <Route path="/anatomy" element={<BezierAnatomy />} />
        <Route path="/long-range-preview" element={<LongRangePreview />} />
        <Route path="/freekick-explorer" element={<FreekickExplorer />} />
        <Route path="/team-comm-byte-format" element={<TeamCommByteFormat />} />
      </Routes>
    </HashRouter>
  );
}
