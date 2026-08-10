import { useRef, useState } from "react";
import { X, Upload, BarChart2, FileDown } from "lucide-react";
import { jsPDF } from "jspdf";
import GlassModal from "./GlassModal.jsx";
import GlassButton from "./GlassButton.jsx";
import Notice from "./Notice.jsx";
import SLIDERS from "../content/physicsSliders.js";
import "./CompareResultsFlow.css";

// Magnetic-pull tuning matching TestCard's START_BUTTON_* constants.
const BTN_REACH_PX = 26;
const BTN_PULL_PX = 7;
const BTN_PULL_STRENGTH = 0.18;

/** Parse and validate an approach-kick results JSON file. */
function parseResultsJson(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("File is not valid JSON.");
  }
  if (!Array.isArray(data.results) || data.results.length === 0) {
    throw new Error("JSON does not contain a valid results array.");
  }
  for (const r of data.results) {
    if (typeof r.angleDeg !== "number") {
      throw new Error("results entries must have a numeric angleDeg field.");
    }
  }
  return data;
}

/** Read a File as text, returning a Promise<string>. */
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsText(file);
  });
}

// ─── SVG Line Chart ─────────────────────────────────────────────────────────

const CHART_W = 560;
const CHART_H = 280;
const PAD = { top: 24, right: 24, bottom: 52, left: 54 };

const COLORS = ["#6ee7f7", "#f97ef4"]; // cyan & pink — visible on dark glass

function lerp(value, inMin, inMax, outMin, outMax) {
  if (inMin === inMax) return (outMin + outMax) / 2;
  return outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin);
}

function nice(v, up) {
  if (v === 0) return 0;
  const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(v))));
  return up ? Math.ceil(v / mag) * mag : Math.floor(v / mag) * mag;
}

// Hex colour string → [r, g, b] 0-255 for jsPDF setDrawColor / setFillColor.
function hexToRgb(hex) {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// A printed/exported PDF page is conventionally light — same call as
// src/lib/pdf/approachKickReport.js's chart, and the same four colours, so
// the app's two PDF outputs read as one document family rather than two
// independently-chosen palettes.
const PDF_BG = "#ffffff";
const PDF_INK = "#1a1f26";
const PDF_GRID = "#d8dde3";
const PDF_MUTED_INK = "#5b6470";
const PDF_DIFF_HIGHLIGHT = "#fff4e6"; // pale amber — a settings row that differs
const PDF_DIFF_INK = "#b4451a";

// Two dataset colours distinguishable on a *white* page — the on-screen
// cyan/pink pair (COLORS, above) is tuned for dark glass and reads as
// near-invisible pastel on paper.
const PDF_DATA_COLORS = ["#10b981", "#2563eb"]; // accent emerald, blue

/**
 * Flattens a dataset's `settings` (radius/ball position/repeats/physics
 * snapshot — the same fields src/lib/pdf/approachKickReport.js's
 * buildResultsJson() writes into each exported results.json) into one
 * ordered list of {label, values: [a, b]} rows for the PDF's settings
 * table. Any field missing from a file (an older export, or one built by
 * hand) renders as "—" rather than throwing, so a comparison never fails
 * just because one side is missing optional metadata.
 */
function buildSettingsRows(datasets) {
  const settings = datasets.map((d) => d.settings || {});

  const fmt = (v, unit = "") => (v === null || v === undefined || v === "" ? "—" : `${v}${unit}`);

  const rows = [
    { label: "Test name", values: settings.map((s) => fmt(s.testName)) },
    { label: "Radius", values: settings.map((s) => fmt(s.radiusM, " m")) },
    {
      label: "Ball position",
      values: settings.map((s) =>
        s.ballX !== undefined && s.ballY !== undefined && s.ballX !== null && s.ballY !== null
          ? `(${s.ballX}, ${s.ballY})`
          : "—",
      ),
    },
    { label: "Repeats per angle", values: settings.map((s) => fmt(s.repeats)) },
    { label: "Generated at", values: settings.map((s) => fmt(s.generatedAt)) },
  ];

  // Physics constants — known sliders first (in their defined order, with
  // proper label/unit via SLIDERS), then anything else present in the JSON
  // that isn't a recognised slider key, so an unrecognised field still shows
  // rather than silently disappearing from the comparison.
  const physicsKeys = new Set(settings.flatMap((s) => Object.keys(s.physics || {})));
  for (const slider of SLIDERS) {
    if (!physicsKeys.has(slider.key)) continue;
    physicsKeys.delete(slider.key);
    rows.push({
      label: slider.label,
      values: settings.map((s) => fmt(s.physics?.[slider.key], slider.unit)),
    });
  }
  for (const key of physicsKeys) {
    rows.push({ label: key, values: settings.map((s) => fmt(s.physics?.[key])) });
  }

  return rows;
}

/**
 * Draws the settings-comparison table (one row per setting/physics
 * constant, one column per dataset) onto a fresh portrait page appended to
 * `doc`. Rows whose two values differ are tinted and flagged with "≠", so a
 * skim of the page surfaces exactly what changed between the two runs.
 */
function drawSettingsTable(doc, datasets, rows) {
  doc.addPage("a4", "portrait");
  const PW = doc.internal.pageSize.getWidth();
  const PH = doc.internal.pageSize.getHeight();
  const margin = 48;

  doc.setFillColor(...hexToRgb(PDF_BG));
  doc.rect(0, 0, PW, PH, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...hexToRgb(PDF_INK));
  doc.text("Settings Comparison", margin, 44);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...hexToRgb(PDF_MUTED_INK));
  doc.text(`Generated: ${new Date().toLocaleString()}`, margin, 58);

  const tableW = PW - margin * 2;
  const labelColW = 190;
  const valueColW = (tableW - labelColW) / datasets.length;
  const headerH = 26;
  const rowH = 22;
  let y = 86;

  const drawRowDivider = (top, height) => {
    doc.setDrawColor(...hexToRgb(PDF_GRID));
    doc.setLineWidth(0.5);
    doc.line(margin + labelColW, top, margin + labelColW, top + height);
    for (let i = 1; i < datasets.length; i++) {
      const x = margin + labelColW + valueColW * i;
      doc.line(x, top, x, top + height);
    }
  };

  const drawHeader = () => {
    doc.setFillColor(...hexToRgb(PDF_GRID));
    doc.rect(margin, y, tableW, headerH, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...hexToRgb(PDF_INK));
    doc.text("Setting", margin + 8, y + headerH / 2, { baseline: "middle" });
    datasets.forEach((ds, i) => {
      doc.text(ds.label, margin + labelColW + valueColW * i + 8, y + headerH / 2, {
        baseline: "middle",
      });
    });
    drawRowDivider(y, headerH);
    y += headerH;
  };

  drawHeader();

  for (const row of rows) {
    if (y + rowH > PH - margin) {
      doc.addPage("a4", "portrait");
      doc.setFillColor(...hexToRgb(PDF_BG));
      doc.rect(0, 0, PW, PH, "F");
      y = margin;
      drawHeader();
    }

    const differs = new Set(row.values).size > 1;

    if (differs) {
      doc.setFillColor(...hexToRgb(PDF_DIFF_HIGHLIGHT));
      doc.rect(margin, y, tableW, rowH, "F");
    }

    doc.setDrawColor(...hexToRgb(PDF_GRID));
    doc.setLineWidth(0.5);
    doc.rect(margin, y, tableW, rowH);
    drawRowDivider(y, rowH);

    doc.setFont("helvetica", differs ? "bold" : "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...hexToRgb(differs ? PDF_DIFF_INK : PDF_INK));
    doc.text(row.label, margin + 8, y + rowH / 2, { baseline: "middle" });
    row.values.forEach((v, i) => {
      doc.text(String(v), margin + labelColW + valueColW * i + 8, y + rowH / 2, {
        baseline: "middle",
      });
    });

    y += rowH;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...hexToRgb(PDF_DIFF_INK));
  doc.text("Highlighted rows differ between result sets.", margin, y + 18);
}

/**
 * Draws the angle/time comparison chart onto the current (first) page of
 * `doc`. Split out from buildCompareChartPdf() so the chart page and the
 * settings-table page (drawSettingsTable(), above) are two independent
 * drawing passes on the same document.
 */
function drawComparisonChartPage(doc, datasets) {
  const PW = doc.internal.pageSize.getWidth();   // 841.89 pt
  const PH = doc.internal.pageSize.getHeight();  // 595.28 pt

  // ── Background ──────────────────────────────────────────────────────────
  doc.setFillColor(...hexToRgb(PDF_BG));
  doc.rect(0, 0, PW, PH, "F");

  // ── Title block ──────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...hexToRgb(PDF_INK));
  doc.text("Approach & Kick Time — Results Comparison", 48, 44);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...hexToRgb(PDF_MUTED_INK));
  doc.text(`Generated: ${new Date().toLocaleString()}`, 48, 58);

  // ── Chart area ───────────────────────────────────────────────────────────
  const cPad = { top: 90, right: 48, bottom: 72, left: 72 };
  const cW = PW - cPad.left - cPad.right;   // usable chart width
  const cH = PH - cPad.top - cPad.bottom;   // usable chart height

  const allAngles = [
    ...new Set(datasets.flatMap((d) => d.results.map((r) => r.angleDeg))),
  ].sort((a, b) => a - b);
  const allY = datasets.flatMap((d) =>
    d.results.map((r) => r.avgTimeSec).filter((v) => v !== null && v !== undefined),
  );

  if (allAngles.length < 2 || allY.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(...hexToRgb(PDF_MUTED_INK));
    doc.text("Not enough data to draw chart.", PW / 2, PH / 2, { align: "center" });
    return;
  }

  const xMin = allAngles[0];
  const xMax = allAngles[allAngles.length - 1];
  const yRawMin = Math.min(...allY);
  const yRawMax = Math.max(...allY);
  const ySpan = yRawMax - yRawMin || yRawMax * 0.2 || 1;
  const yMin = nice(Math.max(0, yRawMin - ySpan * 0.12), false);
  const yMax = nice(yRawMax + ySpan * 0.18, true) || 1;

  // Map data → PDF coordinates (pt)
  const px = (angle) => cPad.left + ((angle - xMin) / (xMax - xMin)) * cW;
  const py = (t) => cPad.top + cH - ((t - yMin) / (yMax - yMin)) * cH;

  // Grid lines
  const Y_TICKS = 5;
  const yTicks = Array.from({ length: Y_TICKS }, (_, i) => yMin + ((yMax - yMin) * i) / (Y_TICKS - 1));
  doc.setDrawColor(...hexToRgb(PDF_GRID));
  doc.setLineWidth(0.5);
  for (const t of yTicks) {
    doc.setLineDashPattern([3, 3], 0);
    doc.line(cPad.left, py(t), cPad.left + cW, py(t));
  }
  doc.setLineDashPattern([], 0);

  // Y-axis tick labels
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...hexToRgb(PDF_MUTED_INK));
  for (const t of yTicks) {
    doc.text(t.toFixed(2), cPad.left - 5, py(t), { align: "right", baseline: "middle" });
  }

  // X-axis tick labels
  const anglesPerTick = allAngles.length > 18 ? 30 : allAngles.length > 9 ? 45 : 1;
  const xTicks = allAngles.filter(
    (a, i) => i === 0 || i === allAngles.length - 1 || (a - xMin) % anglesPerTick === 0,
  );
  for (const a of xTicks) {
    doc.text(`${a}°`, px(a), cPad.top + cH + 14, { align: "center" });
  }

  // Axis lines
  doc.setDrawColor(...hexToRgb(PDF_INK));
  doc.setLineWidth(1);
  doc.line(cPad.left, cPad.top, cPad.left, cPad.top + cH); // Y-axis
  doc.line(cPad.left, cPad.top + cH, cPad.left + cW, cPad.top + cH); // X-axis

  // Axis titles
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...hexToRgb(PDF_MUTED_INK));
  // X title
  doc.text("Approach Angle (°)", cPad.left + cW / 2, cPad.top + cH + 30, { align: "center" });
  // Y title (rotated)
  doc.saveGraphicsState();
  doc.text("Avg Time (s)", -(cPad.top + cH / 2), 16, { angle: 90, align: "center" });
  doc.restoreGraphicsState();

  // Data lines and dots
  for (let di = 0; di < datasets.length; di++) {
    const ds = datasets[di];
    const rgb = hexToRgb(PDF_DATA_COLORS[di % PDF_DATA_COLORS.length]);
    const pts = ds.results
      .filter((r) => r.avgTimeSec !== null && r.avgTimeSec !== undefined)
      .sort((a, b) => a.angleDeg - b.angleDeg);

    if (pts.length < 2) continue;

    // Line
    doc.setDrawColor(...rgb);
    doc.setLineWidth(1.8);
    for (let i = 1; i < pts.length; i++) {
      doc.line(
        px(pts[i - 1].angleDeg), py(pts[i - 1].avgTimeSec),
        px(pts[i].angleDeg),     py(pts[i].avgTimeSec),
      );
    }

    // Dots
    doc.setFillColor(...rgb);
    doc.setDrawColor(...rgb);
    doc.setLineWidth(0);
    for (const r of pts) {
      doc.circle(px(r.angleDeg), py(r.avgTimeSec), 2.2, "F");
    }
  }

  // ── Legend ──────────────────────────────────────────────────────────────
  let lx = cPad.left;
  const ly = PH - 22;
  for (let di = 0; di < datasets.length; di++) {
    const rgb = hexToRgb(PDF_DATA_COLORS[di % PDF_DATA_COLORS.length]);
    doc.setFillColor(...rgb);
    doc.rect(lx, ly - 5, 18, 4, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...hexToRgb(PDF_INK));
    doc.text(datasets[di].label, lx + 22, ly, { baseline: "middle" });
    lx += 22 + doc.getTextWidth(datasets[di].label) + 28;
  }
}

/**
 * Build and return a jsPDF document comparing two Approach & Kick Time
 * result sets: a chart page (drawComparisonChartPage(), a white/light page
 * regardless of the app's own dark theme — same convention as
 * src/lib/pdf/approachKickReport.js) followed by a settings-comparison
 * table page (drawSettingsTable()) covering radius/ball position/repeats
 * and the physics constants each run recorded. Drawn with jsPDF primitives
 * so the output is vector-clean and independent of CSS variables.
 */
function buildCompareChartPdf(datasets) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  drawComparisonChartPage(doc, datasets);

  const rows = buildSettingsRows(datasets);
  if (rows.length > 0) {
    drawSettingsTable(doc, datasets, rows);
  }

  return doc;
}

function CompareLineChart({ datasets }) {
  const allAngles = [
    ...new Set(datasets.flatMap((d) => d.results.map((r) => r.angleDeg))),
  ].sort((a, b) => a - b);
  const allY = datasets.flatMap((d) =>
    d.results.map((r) => r.avgTimeSec).filter((v) => v !== null && v !== undefined),
  );

  if (allAngles.length < 2 || allY.length === 0) {
    return <p className="cr-chart-empty">Not enough data points to draw a graph.</p>;
  }

  const xMin = allAngles[0];
  const xMax = allAngles[allAngles.length - 1];
  const yRawMin = Math.min(...allY);
  const yRawMax = Math.max(...allY);
  const ySpan = yRawMax - yRawMin || yRawMax * 0.2 || 1;
  const yMin = nice(Math.max(0, yRawMin - ySpan * 0.12), false);
  const yMax = nice(yRawMax + ySpan * 0.18, true) || 1;

  const cx = (angle) => lerp(angle, xMin, xMax, PAD.left, CHART_W - PAD.right);
  const cy = (t) => lerp(t, yMin, yMax, CHART_H - PAD.bottom, PAD.top);

  const Y_TICKS = 5;
  const yTicks = Array.from(
    { length: Y_TICKS },
    (_, i) => yMin + ((yMax - yMin) * i) / (Y_TICKS - 1),
  );

  const anglesPerTick = allAngles.length > 18 ? 30 : allAngles.length > 9 ? 45 : 1;
  const xTicks = allAngles.filter(
    (a, i) => i === 0 || i === allAngles.length - 1 || (a - xMin) % anglesPerTick === 0,
  );

  const polylines = datasets.map((ds, di) => {
    const pts = ds.results
      .filter((r) => r.avgTimeSec !== null && r.avgTimeSec !== undefined)
      .sort((a, b) => a.angleDeg - b.angleDeg)
      .map((r) => `${cx(r.angleDeg).toFixed(2)},${cy(r.avgTimeSec).toFixed(2)}`)
      .join(" ");
    return { pts, color: COLORS[di] };
  });

  const [tooltip, setTooltip] = useState(null);
  const svgRef = useRef(null);

  const handleMouseMove = (evt) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mouseX = ((evt.clientX - rect.left) / rect.width) * CHART_W;
    let best = null;
    let bestDist = Infinity;
    for (const angle of allAngles) {
      const d = Math.abs(cx(angle) - mouseX);
      if (d < bestDist) {
        bestDist = d;
        best = angle;
      }
    }
    if (best === null || bestDist > 24) {
      setTooltip(null);
      return;
    }
    const values = datasets.map((ds) => {
      const r = ds.results.find((x) => x.angleDeg === best);
      return { label: ds.label, value: r?.avgTimeSec ?? null };
    });
    setTooltip({ angle: best, values, x: cx(best) });
  };

  return (
    <div className="cr-chart-wrap">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="cr-chart-svg"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
        aria-label="Approach and kick time comparison chart"
      >
        {/* Grid lines */}
        {yTicks.map((t, i) => (
          <line
            key={i}
            x1={PAD.left}
            y1={cy(t)}
            x2={CHART_W - PAD.right}
            y2={cy(t)}
            className="cr-grid-line"
          />
        ))}

        {/* Y-axis labels */}
        {yTicks.map((t, i) => (
          <text key={i} x={PAD.left - 8} y={cy(t)} className="cr-axis-label cr-axis-label--y">
            {t.toFixed(2)}
          </text>
        ))}

        {/* X-axis labels */}
        {xTicks.map((a, i) => (
          <text
            key={i}
            x={cx(a)}
            y={CHART_H - PAD.bottom + 18}
            className="cr-axis-label cr-axis-label--x"
          >
            {a}°
          </text>
        ))}

        {/* Axis lines */}
        <line
          x1={PAD.left}
          y1={PAD.top}
          x2={PAD.left}
          y2={CHART_H - PAD.bottom}
          className="cr-axis-line"
        />
        <line
          x1={PAD.left}
          y1={CHART_H - PAD.bottom}
          x2={CHART_W - PAD.right}
          y2={CHART_H - PAD.bottom}
          className="cr-axis-line"
        />

        {/* Axis titles */}
        <text
          x={PAD.left + (CHART_W - PAD.left - PAD.right) / 2}
          y={CHART_H - 6}
          className="cr-axis-title cr-axis-title--x"
        >
          Approach Angle (°)
        </text>
        <text
          x={14}
          y={PAD.top + (CHART_H - PAD.top - PAD.bottom) / 2}
          className="cr-axis-title cr-axis-title--y"
          transform={`rotate(-90, 14, ${PAD.top + (CHART_H - PAD.top - PAD.bottom) / 2})`}
        >
          Avg Time (s)
        </text>

        {/* Data lines */}
        {polylines.map(({ pts, color }, di) =>
          pts ? (
            <polyline
              key={di}
              points={pts}
              fill="none"
              stroke={color}
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
              className="cr-data-line"
            />
          ) : null,
        )}

        {/* Data dots */}
        {datasets.map((ds, di) =>
          ds.results
            .filter((r) => r.avgTimeSec !== null && r.avgTimeSec !== undefined)
            .map((r, ri) => (
              <circle
                key={`${di}-${ri}`}
                cx={cx(r.angleDeg)}
                cy={cy(r.avgTimeSec)}
                r={3.5}
                fill={COLORS[di]}
                className="cr-dot"
              />
            )),
        )}

        {/* Tooltip vertical guide */}
        {tooltip ? (
          <line
            x1={tooltip.x}
            y1={PAD.top}
            x2={tooltip.x}
            y2={CHART_H - PAD.bottom}
            className="cr-tooltip-line"
          />
        ) : null}

        {/* Tooltip intersection circles */}
        {tooltip
          ? tooltip.values.map(({ value }, di) =>
              value !== null ? (
                <circle
                  key={di}
                  cx={tooltip.x}
                  cy={cy(value)}
                  r={5}
                  fill={COLORS[di]}
                  stroke="var(--glass-fill-droplet-panel, #1a1a2e)"
                  strokeWidth="2"
                />
              ) : null,
            )
          : null}
      </svg>

      {/* Floating tooltip card */}
      {tooltip ? (
        <div className="cr-tooltip">
          <span className="cr-tooltip-angle">{tooltip.angle}°</span>
          {tooltip.values.map(({ label, value }, di) => (
            <div key={di} className="cr-tooltip-row">
              <span className="cr-tooltip-swatch" style={{ background: COLORS[di] }} />
              <span className="cr-tooltip-label">{label}</span>
              <span className="cr-tooltip-value">
                {value !== null ? `${value.toFixed(4)}s` : "timeout"}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {/* Legend */}
      <div className="cr-legend">
        {datasets.map((ds, di) => (
          <div key={di} className="cr-legend-item">
            <span className="cr-legend-swatch" style={{ background: COLORS[di] }} />
            <span className="cr-legend-label">{ds.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── File upload slot ────────────────────────────────────────────────────────

function FileSlot({ index, file, name, error, onFileChange, onNameChange }) {
  const fileInputRef = useRef(null);
  const label = index === 0 ? "First" : "Second";

  return (
    <div className="cr-slot">
      <span className="cr-slot-heading">{label} result set</span>

      <label className="akt-field">
        <span className="akt-field-label">Label (display name)</span>
        <input
          type="text"
          className="akt-field-input"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder={`e.g. Config ${index + 1}`}
          maxLength={40}
        />
      </label>

      <div
        className={`cr-dropzone${file ? " cr-dropzone--has-file" : ""}`}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files[0];
          if (f) onFileChange(f);
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        aria-label={`Upload ${label.toLowerCase()} JSON file`}
      >
        <Upload className="cr-dropzone-icon" aria-hidden="true" />
        {file ? (
          <span className="cr-dropzone-filename">{file.name}</span>
        ) : (
          <span className="cr-dropzone-hint">Click or drag a .json file here</span>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          className="cr-file-input"
          onChange={(e) => {
            const f = e.target.files[0];
            if (f) onFileChange(f);
          }}
          tabIndex={-1}
        />
      </div>

      {error ? <Notice tone="error" title={error} /> : null}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

/**
 * "Compare Results" flow for the Approach & Kick Time test.
 * Stage-swaps between "upload" (two JSON file slots + labels) and
 * "chart" (interactive SVG line graph overlaying both datasets).
 */
export default function CompareResultsFlow({ isOpen, onClose }) {
  const [stage, setStage] = useState("upload");
  const [files, setFiles] = useState([null, null]);
  const [names, setNames] = useState(["Result A", "Result B"]);
  const [errors, setErrors] = useState([null, null]);
  const [globalError, setGlobalError] = useState(null);
  const [datasets, setDatasets] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleClose = () => {
    onClose();
    setTimeout(() => {
      setStage("upload");
      setFiles([null, null]);
      setNames(["Result A", "Result B"]);
      setErrors([null, null]);
      setGlobalError(null);
      setDatasets(null);
    }, 400);
  };

  const setFile = (i, f) =>
    setFiles((prev) => {
      const next = [...prev];
      next[i] = f;
      return next;
    });
  const setName = (i, v) =>
    setNames((prev) => {
      const next = [...prev];
      next[i] = v;
      return next;
    });
  const setError = (i, v) =>
    setErrors((prev) => {
      const next = [...prev];
      next[i] = v;
      return next;
    });

  const handleConfirm = async () => {
    const newErrors = [null, null];
    let hasError = false;

    for (let i = 0; i < 2; i++) {
      if (!files[i]) {
        newErrors[i] = "Please select a JSON file.";
        hasError = true;
      }
      if (!names[i].trim()) {
        newErrors[i] = (newErrors[i] ? newErrors[i] + " " : "") + "Please enter a label.";
        hasError = true;
      }
    }
    setErrors(newErrors);
    if (hasError) return;

    setLoading(true);
    setGlobalError(null);

    try {
      const texts = await Promise.all(files.map((f) => readFileAsText(f)));
      const parsed = texts.map((text, i) => {
        try {
          return parseResultsJson(text);
        } catch (e) {
          throw new Error(`File ${i + 1} (${files[i].name}): ${e.message}`);
        }
      });

      setDatasets(
        parsed.map((data, i) => ({
          label: names[i].trim(),
          results: data.results,
          settings: {
            testName: data.testName ?? null,
            radiusM: data.radius ?? null,
            ballX: data.ballPosition?.x ?? null,
            ballY: data.ballPosition?.y ?? null,
            repeats: data.repeats ?? null,
            generatedAt: data.meta?.generatedAt ?? null,
            physics: data.meta?.physics ?? {},
          },
        })),
      );
      setStage("chart");
    } catch (e) {
      setGlobalError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setStage("upload");
    setDatasets(null);
    setGlobalError(null);
  };

  const handleDownloadPdf = () => {
    if (!datasets) return;
    const doc = buildCompareChartPdf(datasets);
    doc.save(`approach-kick-compare-${Date.now()}.pdf`);
  };

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={handleClose}
      closable
      ariaLabel="Compare approach and kick results"
      className={`cr-modal${stage === "chart" ? " cr-modal--wide" : ""}`}
    >
      <button
        type="button"
        className="test-card-modal-close"
        aria-label="Close"
        onClick={handleClose}
      >
        <X aria-hidden="true" />
      </button>

      <div className="cr-header">
        <BarChart2 className="cr-header-icon" aria-hidden="true" />
        <h3 className="test-card-modal-title">Compare Results</h3>
      </div>

      {stage === "upload" ? (
        <div className="cr-upload-body">
          <p className="test-card-modal-sm">
            Upload two Approach &amp; Kick Time result JSON files to overlay their timing curves on
            a single chart.
          </p>

          <div className="cr-slots">
            {[0, 1].map((i) => (
              <FileSlot
                key={i}
                index={i}
                file={files[i]}
                name={names[i]}
                error={errors[i]}
                onFileChange={(f) => {
                  setFile(i, f);
                  setError(i, null);
                  setGlobalError(null);
                }}
                onNameChange={(v) => setName(i, v)}
              />
            ))}
          </div>

          {globalError ? <Notice tone="error" title={globalError} /> : null}

          <div className="cr-actions">
            <GlassButton
              variant="accent"
              reach={BTN_REACH_PX}
              pull={BTN_PULL_PX}
              strength={BTN_PULL_STRENGTH}
              onClick={handleConfirm}
              disabled={loading}
            >
              {loading ? "Loading\u2026" : "Confirm"}
            </GlassButton>
          </div>
        </div>
      ) : null}

      {stage === "chart" && datasets ? (
        <div className="cr-chart-body">
          <p className="test-card-modal-sm">
            Average approach &amp; kick time vs. starting angle. Hover the chart to inspect values
            at each angle.
          </p>

          <CompareLineChart datasets={datasets} />

          <div className="cr-chart-footer">
            <GlassButton
              variant="accent"
              reach={BTN_REACH_PX}
              pull={BTN_PULL_PX}
              strength={BTN_PULL_STRENGTH}
              onClick={handleDownloadPdf}
            >
              <FileDown className="cr-btn-icon" aria-hidden="true" />
              Download PDF
            </GlassButton>
            <GlassButton
              variant="glass"
              reach={BTN_REACH_PX}
              pull={BTN_PULL_PX}
              strength={BTN_PULL_STRENGTH}
              className="cr-back-btn"
              onClick={handleBack}
            >
              ← Upload different files
            </GlassButton>
          </div>
        </div>
      ) : null}
    </GlassModal>
  );
}
