import { useRef, useState } from "react";
import { X, Upload, BarChart2 } from "lucide-react";
import GlassModal from "./GlassModal.jsx";
import GlassButton from "./GlassButton.jsx";
import Notice from "./Notice.jsx";
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
      ) : null}
    </GlassModal>
  );
}
