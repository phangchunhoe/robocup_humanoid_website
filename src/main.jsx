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
