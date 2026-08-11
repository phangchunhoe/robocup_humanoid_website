import "./CodeSnippet.css";

// A read-only excerpt of a file, so a user can visually locate the line a
// command's note tells them to change instead of hunting for it themselves.
// `lines` is an array of strings or `{ text, emphasis }` — emphasis marks
// the one line the surrounding instructions are actually about; everything
// else recedes, by lightness alone, same as a field's placeholder vs. value.
export default function CodeSnippet({ file, lines }) {
  return (
    <div className="code-snippet">
      <span className="code-snippet-file">{file}</span>
      <pre className="code-snippet-body">
        <code>
          {lines.map((line, i) => {
            const { text, emphasis } =
              typeof line === "string" ? { text: line, emphasis: false } : line;
            return (
              <span
                key={i}
                className={`code-snippet-line${emphasis ? " is-emphasis" : ""}`}
              >
                {text}
              </span>
            );
          })}
        </code>
      </pre>
    </div>
  );
}
