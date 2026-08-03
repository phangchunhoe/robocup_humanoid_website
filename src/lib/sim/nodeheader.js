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
    if (Object.keys(mem).length) members[className] = mem;
  }

  return { portDefaults, members, classes };
}
