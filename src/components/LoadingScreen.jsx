import { useEffect, useState } from "react";
import DotLoader from "./DotLoader.jsx";
import "./LoadingScreen.css";

// A short bounce-and-settle sequence for the dot matrix. Also duplicated as
// a plain literal in index.html's pre-hydration loader (that inline script
// runs before the module graph is available to import from, so it can't
// share this export) — keep the two in sync if this changes.
export const LOADING_FRAMES = [
  [14, 7, 0, 8, 6, 13, 20],
  [14, 7, 13, 20, 16, 27, 21],
  [14, 20, 27, 21, 34, 24, 28],
  [27, 21, 34, 28, 41, 32, 35],
  [34, 28, 41, 35, 48, 40, 42],
  [34, 28, 41, 35, 48, 42, 46],
  [34, 28, 41, 35, 48, 42, 38],
  [34, 28, 41, 35, 48, 30, 21],
  [34, 28, 41, 48, 21, 22, 14],
  [34, 28, 41, 21, 14, 16, 27],
  [34, 28, 21, 14, 10, 20, 27],
  [28, 21, 14, 4, 13, 20, 27],
  [28, 21, 14, 12, 6, 13, 20],
  [28, 21, 14, 6, 13, 20, 11],
  [28, 21, 14, 6, 13, 20, 10],
  [14, 6, 13, 20, 9, 7, 21],
];

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

/**
 * The app's one loading state, shown full-viewport wherever there is
 * otherwise nothing on screen yet — the pre-hydration splash (a static twin
 * of this markup lives in index.html, since React itself isn't running
 * yet) and any in-app Suspense fallback.
 */
export default function LoadingScreen({ label = "Loading" }) {
  const reducedMotion = usePrefersReducedMotion();

  return (
    <div className="loading-screen" role="status" aria-live="polite">
      <DotLoader frames={LOADING_FRAMES} duration={90} isPlaying={!reducedMotion} />
      <p className="loading-screen-label">{label}</p>
    </div>
  );
}
