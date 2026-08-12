import { useEffect, useRef, useState } from "react";
import Header from "../components/Header.jsx";
import simulationMathToc from "../content/simulationMathToc.js";
import PhysicsEngineSection from "../components/simmath/sections/PhysicsEngineSection.jsx";
import PerceptionSection from "../components/simmath/sections/PerceptionSection.jsx";
import MathPrimitivesSection from "../components/simmath/sections/MathPrimitivesSection.jsx";
import TelemetryCurvesSection from "../components/simmath/sections/TelemetryCurvesSection.jsx";
import RealtimeLoopSection from "../components/simmath/sections/RealtimeLoopSection.jsx";
import ApproachKickTestSection from "../components/simmath/sections/ApproachKickTestSection.jsx";
import FieldSvgMappingSection from "../components/simmath/sections/FieldSvgMappingSection.jsx";
import "./SimulationMath.css";

const SECTION_COMPONENTS = {
  "physics-engine": PhysicsEngineSection,
  "perception-model": PerceptionSection,
  "math-primitives": MathPrimitivesSection,
  "telemetry-curves": TelemetryCurvesSection,
  "realtime-loop": RealtimeLoopSection,
  "approach-kick-test": ApproachKickTestSection,
  "field-svg-mapping": FieldSvgMappingSection,
};

/**
 * Scroll-spy: highlights whichever section's heading is currently nearest the top
 * of the viewport, via IntersectionObserver rather than a scroll listener (no
 * per-frame layout reads, no manual rAF throttling).
 */
/**
 * Scrolls to a section/formula heading without touching the URL hash. This app runs
 * on HashRouter, which owns `location.hash` for routing — a plain `<a href="#id">`
 * would replace the route hash (e.g. "#/simulation-math") with "#id", and the router
 * would then try (and fail) to match "id" as a route, rendering a blank page. Native
 * anchor scrolling and HashRouter can't share the same hash, so this does the
 * scrolling itself instead of relying on the browser's default fragment navigation.
 */
function scrollToId(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function useActiveSection(sectionIds) {
  const [active, setActive] = useState(sectionIds[0]);
  const visibleRatios = useRef(new Map());

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          visibleRatios.current.set(entry.target.id, entry.isIntersecting ? entry.intersectionRatio : 0);
        }
        let best = null;
        let bestRatio = 0;
        for (const [id, ratio] of visibleRatios.current) {
          if (ratio > bestRatio) {
            best = id;
            bestRatio = ratio;
          }
        }
        if (best) setActive(best);
      },
      { rootMargin: "-15% 0px -70% 0px", threshold: [0, 0.1, 0.25, 0.5, 1] }
    );

    for (const id of sectionIds) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [sectionIds]);

  return active;
}

export default function SimulationMath() {
  useEffect(() => {
    document.title = "Simulation Math — How the Simulator Works";
  }, []);

  const sectionIds = simulationMathToc.map((s) => s.id);
  const activeId = useActiveSection(sectionIds);

  return (
    <div className="sim-math-page">
      <Header />
      <div className="sm-layout">
        <nav className="sm-toc" aria-label="Table of contents">
          <div className="sm-toc-inner">
            <span className="sm-toc-label">On this page</span>
            <ol className="sm-toc-list">
              {simulationMathToc.map((section) => (
                <li key={section.id} className={activeId === section.id ? "is-active" : ""}>
                  <button type="button" onClick={() => scrollToId(section.id)}>
                    {section.label}
                  </button>
                  <ol className="sm-toc-sublist">
                    {section.formulas.map((f) => (
                      <li key={f.id}>
                        <button type="button" onClick={() => scrollToId(f.id)}>
                          {f.label}
                        </button>
                      </li>
                    ))}
                  </ol>
                </li>
              ))}
            </ol>
          </div>
        </nav>

        <main className="sm-content">
          <header className="sm-hero">
            <span className="sm-eyebrow">src/lib/sim/</span>
            <h1>Simulation math</h1>
            <p className="sm-dek">
              Every formula behind the robot simulator — the physics engine, the vision model, the curve
              math, and the test harness — with what each symbol means and a visualization you can play
              with. This is the math implemented in this repo&apos;s own code, not the pasted{" "}
              <code>brain_tree.cpp</code>, which is arbitrary and only interpreted.
            </p>
          </header>

          {simulationMathToc.map((section) => {
            const Section = SECTION_COMPONENTS[section.id];
            return <Section key={section.id} />;
          })}
        </main>
      </div>
    </div>
  );
}
