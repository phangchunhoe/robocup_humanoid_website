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
  canvas.width = CHART_PX_W;
  canvas.height = CHART_PX_H;
  const ctx = canvas.getContext("2d");

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

  const angles = results.map((r) => r.angleDeg);
  const minAngle = Math.min(...angles);
  const maxAngle = Math.max(...angles);
  const values = results.map((r) => r.avgTimeSec).filter((v) => v !== null && v !== undefined);
  const maxValue = niceMax(values.length > 0 ? Math.max(...values) : 1);

  const xForAngle = (angleDeg) => plotX0 + ((angleDeg - minAngle) / (maxAngle - minAngle || 1)) * plotW;
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
  const xTickStepDeg = 30;
  for (let angleDeg = minAngle; angleDeg <= maxAngle; angleDeg += xTickStepDeg) {
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
  for (const r of results) {
    if (r.avgTimeSec === null || r.avgTimeSec === undefined) {
      drawing = false;
      continue;
    }
    const x = xForAngle(r.angleDeg);
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
  for (const r of results) {
    if (r.avgTimeSec === null || r.avgTimeSec === undefined) continue;
    const x = xForAngle(r.angleDeg);
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
 * the caller decides when, e.g. on a button click). `testResult` is exactly
 * the object approachKickTest.js's runApproachKickTest() resolves to (plus
 * the run's own name/inputs/timestamp), so this and the in-page JSON block
 * read the same shape.
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
  y += 14;

  // Structured JSON results — same shape the in-page copyable block shows.
  const jsonPayload = buildResultsJson({ testName, radiusM, ballX, ballY, repeats, physicsSnapshot, generatedAt, results });
  const jsonText = JSON.stringify(jsonPayload, null, 2);

  if (y > doc.internal.pageSize.getHeight() - margin - 40) {
    doc.addPage();
    y = margin;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Structured results (JSON)", margin, y);
  y += 18;

  doc.setFont("courier", "normal");
  doc.setFontSize(8);
  const jsonLines = doc.splitTextToSize(jsonText, pageWidth - margin * 2);
  for (const line of jsonLines) {
    if (y > doc.internal.pageSize.getHeight() - margin) {
      doc.addPage();
      y = margin;
    }
    doc.text(line, margin, y);
    y += 10;
  }

  return doc;
}

/**
 * The stable, parseable JSON shape shown in the UI's copy block and embedded
 * in the PDF — one object, read by both, so they can never drift apart.
 * Matches the literal shape from the feature spec (testName/radius/
 * ballPosition/repeats/results[]), plus two additive fields a naive parser
 * reading those keys still ignores safely: timedOutCount per angle, and a
 * meta block carrying what a future "compare two tests" feature would need
 * beyond the bare numbers.
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
