import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

/**
 * Renders a LaTeX string via KaTeX. Self-hosted npm package (like the app's own
 * webfonts) — no CDN request, works offline, no render-blocking external stylesheet.
 *
 * KaTeX's own math faces (KaTeX_Main/Math/...) are a deliberate, narrow exception to
 * "two families, each with one job" (CLAUDE.md -> Typography): a rendered equation's
 * italic variables, fraction bars, and glyph spacing are the formula's own material,
 * not UI chrome, the same reasoning that lets the progress bar's ball glyph sit outside
 * the neutral ramp. Colors are still token-driven — see Tex.css.
 */
export default function Tex({ math, display = false, className = "" }) {
  const html = useMemo(
    () => katex.renderToString(math, { displayMode: display, throwOnError: false, output: "html" }),
    [math, display]
  );
  return (
    <span
      className={`tex ${display ? "tex-display" : "tex-inline"} ${className}`}
      // eslint-disable-next-line react/no-danger -- KaTeX's own trusted output, no user input reaches this
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
