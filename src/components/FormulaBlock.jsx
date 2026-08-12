import Tex from "./Tex.jsx";
import "./Tex.css";
import "./FormulaBlock.css";

/**
 * One formula's full explainer: the equation, a symbol/meaning table, a point-form
 * explanation, and a slot for its visualization. Every formula on the Simulation Math
 * page plugs into this one shape, so ~20 different explanations still read as one
 * system rather than as one-off write-ups.
 *
 * `formula` is a single display-mode TeX string, or an array of TeX strings rendered
 * as stacked equations (for formulas the README itself splits across two $$ blocks).
 */
export default function FormulaBlock({ id, eyebrow, title, formula, variables = [], points = [], viz, note }) {
  const formulas = Array.isArray(formula) ? formula : [formula];

  return (
    <article className="fblock" id={id}>
      <div className="fblock-head">
        {eyebrow && <span className="fblock-eyebrow">{eyebrow}</span>}
        <h3 className="fblock-title">{title}</h3>
      </div>

      <div className="fblock-equation">
        {formulas.map((f, i) => (
          <Tex key={i} math={f} display />
        ))}
      </div>

      <div className="fblock-body">
        <div className="fblock-explain">
          {variables.length > 0 && (
            <table className="fblock-vars">
              <thead>
                <tr>
                  <th scope="col">Symbol</th>
                  <th scope="col">Meaning</th>
                </tr>
              </thead>
              <tbody>
                {variables.map((v, i) => (
                  <tr key={i}>
                    <td>
                      <Tex math={v.symbol} />
                    </td>
                    <td>{v.meaning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {points.length > 0 && (
            <ul className="fblock-points">
              {points.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          )}

          {note && <p className="fblock-note">{note}</p>}
        </div>

        {viz && <div className="fblock-viz">{viz}</div>}
      </div>
    </article>
  );
}
