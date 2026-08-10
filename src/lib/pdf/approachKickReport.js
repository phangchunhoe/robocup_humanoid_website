// Client-side PDF report for the Approach & Kick Time test (no backend). Two
// pieces: a hand-drawn line chart rasterized to a <canvas> and embedded as an
// image (no charting dependency — see the plan's own "Chart rendering"
// decision), and the jsPDF document itself.
//
// The chart intentionally does NOT read the app's dark-mode tokens
// (tokens.css) for its background/ink — those are tuned for the HUD's dark
// canvas, and a printed/exported PDF page is conventionally light. It does
// still sample --color-accent via getComputedStyle so the data line stays
// on-brand and follows the token if it ever changes; only the chart's
// background/axis ink deliberately diverge from the app's own dark palette.

import { jsPDF } from "jspdf";
import SLIDERS from "../../content/physicsSliders.js";

const CHART_PX_W = 900;
const CHART_PX_H = 420;
const CHART_MARGIN = { top: 24, right: 24, bottom: 48, left: 64 };
// Physical pixels are CHART_PX_W/H * CHART_SCALE; every draw call below still
// works in the original 900x420 logical space via ctx.scale(), so raising
// this is the only thing needed for a sharper embedded PNG. 3x produced a
// ~10MB PDF for one simple line chart (PNG encodes the anti-aliased line/text
// edges poorly at that pixel count) — 2x is still a real resolution increase
// over the original 1x without that file-size cliff.
const CHART_SCALE = 2;
// The chart's x-axis convention: 0° = directly in front, +/-180° = directly
// behind, rather than the JSON's own 0-350 sweep order. This only affects
// how the chart plots/labels angles — angleDeg in the JSON/PDF-adjacent data
// stays 0-350, the stable shape agreed for that output.
const CHART_MIN_ANGLE = -180;
const CHART_MAX_ANGLE = 180;
const CHART_X_TICK_STEP = 60;

/** Maps the JSON's 0-350 angleDeg onto the chart's -180..180 convention. */
function toChartAngle(angleDeg) {
  return angleDeg > 180 ? angleDeg - 360 : angleDeg;
}

function readAccentColor() {
  if (typeof document === "undefined") return "#10b981";
  const value = getComputedStyle(document.documentElement).getPropertyValue("--color-accent");
  return value ? value.trim() : "#10b981";
}

function niceMax(value) {
  if (!(value > 0)) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const steps = [1, 2, 2.5, 5, 10];
  for (const step of steps) {
    const candidate = step * magnitude;
    if (candidate >= value) return candidate;
  }
  return 10 * magnitude;
}

/**
 * Draws the angle (x) vs. average kick time (y) line chart onto `canvas`.
 * A missing (all-repeats-timed-out) angle breaks the line rather than
 * silently bridging the gap, so a gap in the data reads as a gap on the
 * chart. Returns nothing — mutates the canvas in place.
 */
export function drawAngleTimeChart(canvas, results) {
  canvas.width = CHART_PX_W * CHART_SCALE;
  canvas.height = CHART_PX_H * CHART_SCALE;
  const ctx = canvas.getContext("2d");
  ctx.scale(CHART_SCALE, CHART_SCALE);

  const bg = "#ffffff";
  const ink = "#1a1f26";
  const gridColor = "#d8dde3";
  const mutedInk = "#5b6470";
  const lineColor = readAccentColor();

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CHART_PX_W, CHART_PX_H);

  const plotW = CHART_PX_W - CHART_MARGIN.left - CHART_MARGIN.right;
  const plotH = CHART_PX_H - CHART_MARGIN.top - CHART_MARGIN.bottom;
  const plotX0 = CHART_MARGIN.left;
  const plotY0 = CHART_MARGIN.top;

  // Plotted left-to-right on the -180..180 "directly behind to directly
  // behind" convention rather than the JSON's own 0-350 sweep order — sort a
  // working copy by the remapped angle so the line is drawn in the right
  // order (0, 10, ..., 180 then wraps to -170, -160, ..., -10 in sweep
  // order, which is not left-to-right once remapped).
  const chartResults = results
    .map((r) => ({ ...r, chartAngle: toChartAngle(r.angleDeg) }))
    .sort((a, b) => a.chartAngle - b.chartAngle);

  const minAngle = CHART_MIN_ANGLE;
  const maxAngle = CHART_MAX_ANGLE;
  const values = results.map((r) => r.avgTimeSec).filter((v) => v !== null && v !== undefined);
  const maxValue = niceMax(values.length > 0 ? Math.max(...values) : 1);

  const xForAngle = (chartAngle) => plotX0 + ((chartAngle - minAngle) / (maxAngle - minAngle || 1)) * plotW;
  const yForValue = (value) => plotY0 + plotH - (value / maxValue) * plotH;

  // Axes + gridlines.
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 1;
  ctx.fillStyle = mutedInk;
  ctx.font = "12px 'JetBrains Mono', ui-monospace, monospace";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  const yTicks = 5;
  for (let i = 0; i <= yTicks; i += 1) {
    const value = (maxValue / yTicks) * i;
    const y = yForValue(value);
    ctx.beginPath();
    ctx.moveTo(plotX0, y);
    ctx.lineTo(plotX0 + plotW, y);
    ctx.stroke();
    ctx.fillText(value.toFixed(2), plotX0 - 8, y);
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (let angleDeg = minAngle; angleDeg <= maxAngle; angleDeg += CHART_X_TICK_STEP) {
    const x = xForAngle(angleDeg);
    ctx.fillText(`${angleDeg}°`, x, plotY0 + plotH + 10);
  }

  ctx.strokeStyle = ink;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(plotX0, plotY0);
  ctx.lineTo(plotX0, plotY0 + plotH);
  ctx.lineTo(plotX0 + plotW, plotY0 + plotH);
  ctx.stroke();

  // Axis labels.
  ctx.fillStyle = ink;
  ctx.font = "13px 'Space Grotesk', system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("Approach angle (degrees)", plotX0 + plotW / 2, CHART_PX_H - 8);
  ctx.save();
  ctx.translate(16, plotY0 + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("Avg. time to kick/cross (s)", 0, 0);
  ctx.restore();

  // Data line — broken at gaps (a timed-out angle) rather than bridged.
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";
  let drawing = false;
  for (const r of chartResults) {
    if (r.avgTimeSec === null || r.avgTimeSec === undefined) {
      drawing = false;
      continue;
    }
    const x = xForAngle(r.chartAngle);
    const y = yForValue(r.avgTimeSec);
    if (!drawing) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      drawing = true;
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();

  // Data points, drawn after the line so they sit on top.
  ctx.fillStyle = lineColor;
  for (const r of chartResults) {
    if (r.avgTimeSec === null || r.avgTimeSec === undefined) continue;
    const x = xForAngle(r.chartAngle);
    const y = yForValue(r.avgTimeSec);
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function describePhysicsConstant(key, value) {
  const slider = SLIDERS.find((s) => s.key === key);
  if (slider) return `${slider.label}: ${value}${slider.unit}`;
  return `${key}: ${value}`;
}

/**
 * Builds the full report as a jsPDF document (does not save/download it —
 * the caller decides when, e.g. on a button click): title/subheading, the
 * angle/time chart, and the physics constants in effect. The structured JSON
 * results are deliberately NOT included here — they're shown in-page instead
 * (copyable and separately downloadable as a .json file, see
 * ApproachKickTestFlow.jsx), via buildResultsJson() below.
 */
export function buildApproachKickPdf({
  testName,
  generatedAt,
  radiusM,
  ballX,
  ballY,
  repeats,
  physicsSnapshot,
  results,
}) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 48;
  let y = margin;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(testName, margin, y);
  y += 22;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(90, 90, 90);
  const subheading = [
    `Run: ${generatedAt}`,
    `Radius: ${radiusM} m`,
    `Ball position: (${ballX}, ${ballY})`,
    `Repeats per angle: ${repeats}`,
  ].join("   |   ");
  doc.text(subheading, margin, y);
  y += 28;
  doc.setTextColor(0, 0, 0);

  // Chart.
  const canvas = document.createElement("canvas");
  drawAngleTimeChart(canvas, results);
  const imgW = pageWidth - margin * 2;
  const imgH = imgW * (CHART_PX_H / CHART_PX_W);
  doc.addImage(canvas.toDataURL("image/png"), "PNG", margin, y, imgW, imgH);
  y += imgH + 28;

  // Physics constants in effect.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Physics constants in effect", margin, y);
  y += 18;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const constantLines = Object.keys(physicsSnapshot)
    .sort()
    .map((key) => describePhysicsConstant(key, physicsSnapshot[key]));
  for (const line of constantLines) {
    if (y > doc.internal.pageSize.getHeight() - margin) {
      doc.addPage();
      y = margin;
    }
    doc.text(line, margin, y);
    y += 14;
  }

  return doc;
}

/**
 * The stable, parseable JSON shape shown in the UI's copy block and its
 * separate .json download (ApproachKickTestFlow.jsx) — one object, read by
 * both, so they can never drift apart. Matches the literal shape from the
 * feature spec (testName/radius/ballPosition/repeats/results[]), plus two
 * additive fields a naive parser reading those keys still ignores safely:
 * timedOutCount per angle, and a meta block carrying what a future "compare
 * two tests" feature would need beyond the bare numbers.
 */
export function buildResultsJson({ testName, radiusM, ballX, ballY, repeats, physicsSnapshot, generatedAt, results }) {
  return {
    testName,
    radius: radiusM,
    ballPosition: { x: ballX, y: ballY },
    repeats,
    results: results.map((r) => ({
      angleDeg: r.angleDeg,
      avgTimeSec: r.avgTimeSec === null ? null : Number(r.avgTimeSec.toFixed(4)),
      runs: r.runs.map((v) => (v === null ? null : Number(v.toFixed(4)))),
      timedOutCount: r.timedOutCount,
    })),
    meta: {
      generatedAt,
      physics: physicsSnapshot,
    },
  };
}
