import ReactDOM from "react-dom/client";
import App from "./App.jsx";

/* Self-hosted webfaces, latin subset only, imported ahead of the token layer
   that names them. Vendored from npm (@fontsource) rather than linked from
   Google Fonts: no third-party request on every page load, no render-blocking
   external stylesheet, and the app still works offline. Only the weights the
   type scale actually uses are pulled in — 400/500/600/700 sans, 400/500/600
   mono — so adding a weight here means adding it to a token too. */
import "@fontsource/space-grotesk/latin-400.css";
import "@fontsource/space-grotesk/latin-500.css";
import "@fontsource/space-grotesk/latin-600.css";
import "@fontsource/space-grotesk/latin-700.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-500.css";
import "@fontsource/jetbrains-mono/latin-600.css";

import "./styles/tokens.css";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(<App />);

/* Hand off from the static pre-hydration loader in index.html to the real
   app. Wait for webfonts too, not just the render call: the loader is
   still covering the screen at this point, so this is the one moment the
   app can swap Space Grotesk/JetBrains Mono in before anything is visible,
   rather than the page flashing its system-font fallback for a beat. The
   timeout is a safety net in case a font load ever hangs or errors. */
const initialLoader = document.getElementById("initial-loader");
if (initialLoader) {
  const fontsReady = document.fonts?.ready ?? Promise.resolve();
  const safetyTimeout = new Promise((resolve) => setTimeout(resolve, 2000));

  Promise.race([fontsReady, safetyTimeout]).then(() => {
    // Two rAFs: the first is queued before the browser's next paint, the
    // second runs after it — so the real app is guaranteed to have painted
    // at least once behind the loader before it starts fading out.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (window.__initialLoaderTimer) clearInterval(window.__initialLoaderTimer);
        initialLoader.classList.add("is-hiding");
        initialLoader.addEventListener("transitionend", () => initialLoader.remove(), { once: true });
      });
    });
  });
}
