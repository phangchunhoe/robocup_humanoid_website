import { useEffect, useRef, useState } from "react";
import { Copy, Check } from "lucide-react";
import "./CommandRow.css";

// A read-only command string with a copy control joined to its right edge —
// the same "path input group" pattern the simulator's source field uses
// (CLAUDE.md → Components → Path input group), reused here because a shell
// command is exactly the kind of technical string that pattern is for.
export default function CommandRow({ command, note }) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef(null);

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(command);
    } catch {
      return;
    }
    setCopied(true);
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="cmd-row">
      <div className={`cmd-row-group${copied ? " is-copied" : ""}`}>
        <code className="cmd-row-value">{command}</code>
        <button
          type="button"
          className="cmd-row-copy"
          onClick={handleCopy}
          aria-label={copied ? "Copied to clipboard" : `Copy command: ${command}`}
        >
          {copied ? (
            <Check aria-hidden="true" size={14} />
          ) : (
            <Copy aria-hidden="true" size={14} />
          )}
          <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      {note && <p className="cmd-row-note">{note}</p>}
    </div>
  );
}
