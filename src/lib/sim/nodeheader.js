// Parse include/brain_tree.h for two things the simulator needs:
//
//   1. providedPorts() defaults -- InputPort<double>("dist", 0.1, "...")
//      Used when the pasted XML omits a port the C++ reads.
//   2. Node member initialisers -- double _lockDurationMs = 1200.0;
//      Used to seed node instance state so the first tick starts from the real values.
//
// Optional: without it, missing ports are an error and members start at 0.

import { blankNonCode } from "../cpp/extract.js";

function coerceLiteral(raw) {
  const t = raw.trim().replace(/[fFuUlL]+$/, "");
  if (t === "true") return true;
  if (t === "false") return false;
  if (/^-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) return Number(t);
  if (/^-?\d+\.?\d*\s*\/\s*\d+\.?\d*$/.test(t)) {
    const [a, b] = t.split("/").map(Number);
    return a / b;
  }
  if (/^M_PI$/.test(t)) return Math.PI;
  if (/^M_PI\s*\/\s*\d+\.?\d*$/.test(t)) return Math.PI / Number(t.split("/")[1]);
  return undefined;
}

function matchBrace(cleaned, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < cleaned.length; i += 1) {
    if (cleaned[i] === "{") depth += 1;
    else if (cleaned[i] === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Top-level comma split of a brace-init list's contents, respecting nested braces. */
function splitTopLevel(inner) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < inner.length; i += 1) {
    const c = inner[i];
    if (c === "{") depth += 1;
    else if (c === "}") depth -= 1;
    else if (c === "," && depth === 0) {
      parts.push(inner.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(inner.slice(start));
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

/**
 * `{0.45, 1.1}` or `{{0.45, 1.1}, {0.45, 0.0}, ...}` -- a fixed C array's brace-init,
 * to any nesting depth. Each leaf goes through the same coerceLiteral() a scalar member
 * initialiser does; undefined anywhere in the list bails the whole thing out rather than
 * seeding a partially-real array (0::_cmdSequence[3] silently being `undefined` is worse
 * than the array not being seeded at all -- see the bareRe/memberRe passes below).
 */
function parseArrayLiteral(text) {
  const t = text.trim();
  if (!t.startsWith("{") || !t.endsWith("}")) return undefined;
  const parts = splitTopLevel(t.slice(1, -1));
  const out = [];
  for (const p of parts) {
    const v = p.startsWith("{") ? parseArrayLiteral(p) : coerceLiteral(p);
    if (v === undefined) return undefined;
    out.push(v);
  }
  return out;
}

/**
 * @returns {{ portDefaults: Record<string, Record<string, any>>,
 *             members: Record<string, Record<string, any>>,
 *             classes: string[] }}
 */
export function parseNodeHeader(headerText) {
  const portDefaults = {};
  const members = {};
  const classes = [];
  if (!headerText || !headerText.trim()) return { portDefaults, members, classes };

  const cleaned = blankNonCode(headerText);
  const classRe = /\bclass\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?::[^{;]*)?\{/g;
  let m;
  while ((m = classRe.exec(cleaned)) !== null) {
    const className = m[1];
    const openIdx = cleaned.indexOf("{", m.index);
    const closeIdx = matchBrace(cleaned, openIdx);
    if (closeIdx < 0) continue;
    classRe.lastIndex = closeIdx;

    const body = headerText.slice(openIdx, closeIdx + 1);
    const bodyCleaned = cleaned.slice(openIdx, closeIdx + 1);
    classes.push(className);

    // --- providedPorts() defaults ---
    // InputPort<double>("dist", 0.1, "Target distance behind the ball when chasing")
    const portRe = /InputPort\s*<[^>]*>\s*\(\s*"([^"]+)"\s*(?:,\s*([^,)]+))?/g;
    let pm;
    const ports = {};
    while ((pm = portRe.exec(body)) !== null) {
      const name = pm[1];
      const value = pm[2] !== undefined ? coerceLiteral(pm[2]) : undefined;
      if (value !== undefined) ports[name] = value;
    }
    if (Object.keys(ports).length) portDefaults[className] = ports;

    // --- member declarations ---
    // Two passes. First, members declared WITHOUT an initialiser get the zero value for
    // their declared type, so a `string _lastStrategyLogState;` starts as "" rather than
    // 0 -- otherwise string comparisons against it behave oddly on the first tick.
    const bareRe =
      /\b(double|float|int|bool|string|long|short|size_t)\s+([A-Za-z_][A-Za-z0-9_]*)\s*;/g;
    const mem = {};
    let bm;
    while ((bm = bareRe.exec(bodyCleaned)) !== null) {
      const type = bm[1];
      mem[bm[2]] = type === "bool" ? false : type === "string" ? "" : 0;
    }

    // Second, explicit initialisers win: `double _lockDurationMs = 1200.0;`
    const memberRe =
      /\b(?:double|float|int|bool|string|long|short|size_t)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([^;{}()]+);/g;
    let mm;
    while ((mm = memberRe.exec(bodyCleaned)) !== null) {
      const raw = body.slice(mm.index, mm.index + mm[0].length);
      const parts = /=\s*([^;]+);/.exec(raw);
      const value = parts ? coerceLiteral(parts[1]) : undefined;
      if (value !== undefined) mem[mm[1]] = value;
    }

    // Third, fixed-array members with a brace-init default, e.g.
    // `double _cmdSequence[7][2] = {{0.45, 1.1}, {0.45, 0.0}, ...};` (GoalieZoneFindBall,
    // CamFindBall's own analog is populated in its constructor body instead, which this
    // header-only parser has no way to see -- that one stays unseeded). Without this, the
    // member falls through to the bareRe/generic "unknown identifier" 0 default and any
    // later `_cmdSequence[i][j]` read throws indexing a number instead of an array.
    const arrayRe =
      /\b(?:double|float|int|bool|string|long|short|size_t)\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:\[[^;=[\]]*\])+\s*=\s*/g;
    let arm;
    while ((arm = arrayRe.exec(bodyCleaned)) !== null) {
      const braceStart = arm.index + arm[0].length;
      if (bodyCleaned[braceStart] !== "{") continue;
      const braceEnd = matchBrace(bodyCleaned, braceStart);
      if (braceEnd < 0) continue;
      const value = parseArrayLiteral(body.slice(braceStart, braceEnd + 1));
      if (value !== undefined) mem[arm[1]] = value;
      arrayRe.lastIndex = braceEnd + 1;
    }

    if (Object.keys(mem).length) members[className] = mem;
  }

  return { portDefaults, members, classes };
}
