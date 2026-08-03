// Selective extraction from a pasted C++ file.
//
// brain_tree.cpp is ~527 KB / ~11,000 lines, almost none of which this interpreter could
// or should handle: class definitions, ROS callbacks, rerun logging, teammate comms,
// dozens of unrelated behaviour-tree nodes. Nothing outside the whitelisted function
// bodies is ever tokenised, so unsupported C++ elsewhere in the file cannot produce a
// diagnostic -- it is simply never looked at.
//
// The scan is structural only: one linear pass to blank out comments and string/char
// literals, then brace matching to locate `name(...) { ... }` spans. No AST, no types.

/** Functions the simulator drives directly. */
export const WHITELIST = [
  "TickChaseNode",
  "StrikerChase::tick",
  "GoalieChase::tick",
  "Chase::tick",
  "Adjust::tick",
  "StrikerDecide::tick",
  "GoalieDecide::tick",
  "Kick::onStart",
  "Kick::onRunning",
  "CalcKickDir::tick",
  // decision=='retreat' (goalkeeper only). Delegates the actual walk to
  // brain->client->moveToPoseOnField2(), a robot_client.cpp primitive implemented
  // natively in host.js -- see the note there for why that one is not extracted.
  "GoToGoalBlockingPosition::tick",
];

/** Which of the above must be present for a role before Run is allowed. */
export const REQUIRED_BY_ROLE = {
  striker: ["TickChaseNode", "StrikerChase::tick", "Adjust::tick", "StrikerDecide::tick", "Kick::onRunning", "CalcKickDir::tick"],
  goal_keeper: [
    "TickChaseNode",
    "GoalieChase::tick",
    "Adjust::tick",
    "GoalieDecide::tick",
    "Kick::onRunning",
    "CalcKickDir::tick",
    "GoToGoalBlockingPosition::tick",
  ],
};

const CPP_KEYWORDS = new Set([
  "if", "for", "while", "switch", "return", "sizeof", "catch", "throw", "do", "else",
  "case", "new", "delete", "and", "or", "not", "static_cast", "dynamic_cast",
  "const_cast", "reinterpret_cast", "decltype", "typeid", "alignof", "noexcept",
]);

const MAX_DEPENDENCY_DEPTH = 3;

/**
 * Blank out comments and string/char literals, preserving length and newlines so every
 * offset in the result maps 1:1 onto the original paste.
 */
export function blankNonCode(src) {
  const out = new Array(src.length);
  let i = 0;
  const n = src.length;
  const put = (from, to) => {
    for (let k = from; k < to; k += 1) out[k] = src[k] === "\n" ? "\n" : " ";
  };

  while (i < n) {
    const ch = src[i];
    if (ch === "/" && src[i + 1] === "/") {
      const start = i;
      while (i < n && src[i] !== "\n") i += 1;
      put(start, i);
      continue;
    }
    if (ch === "/" && src[i + 1] === "*") {
      const start = i;
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i += 1;
      i = Math.min(i + 2, n);
      put(start, i);
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      const start = i;
      i += 1;
      while (i < n && src[i] !== quote) {
        if (src[i] === "\\") i += 2;
        else i += 1;
      }
      i = Math.min(i + 1, n);
      put(start, i);
      continue;
    }
    out[i] = ch;
    i += 1;
  }
  return out.join("");
}

function matchBrace(cleaned, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < cleaned.length; i += 1) {
    const c = cleaned[i];
    if (c === "{") depth += 1;
    else if (c === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function matchParen(cleaned, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < cleaned.length; i += 1) {
    const c = cleaned[i];
    if (c === "(") depth += 1;
    else if (c === ")") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Split a parameter list at depth 0 and keep the declared name of each parameter. */
function parseParams(text) {
  const params = [];
  let depth = 0;
  let current = "";
  const flush = () => {
    const t = current.trim();
    current = "";
    if (!t || t === "void") return;
    // The name is the last identifier, ignoring a default-argument tail.
    const head = t.split("=")[0];
    const ids = head.match(/[A-Za-z_][A-Za-z0-9_]*/g);
    if (ids && ids.length) params.push(ids[ids.length - 1]);
    else params.push(`arg${params.length}`);
  };
  for (const ch of text) {
    if (ch === "(" || ch === "<" || ch === "[") depth += 1;
    else if (ch === ")" || ch === ">" || ch === "]") depth -= 1;
    if (ch === "," && depth === 0) {
      flush();
      continue;
    }
    current += ch;
  }
  flush();
  return params;
}

/**
 * Locate definitions of the named functions.
 * @returns {Map<string, {name, params, bodySrc, bodyStart, defStart, defEnd}>}
 */
export function findFunctionDefinitions(src, cleaned, names) {
  const wanted = new Set(names);
  const found = new Map();
  if (wanted.size === 0) return found;

  // Candidate: an identifier (possibly Class::method) immediately followed by '('.
  const re = /([A-Za-z_][A-Za-z0-9_]*(?:::[A-Za-z_][A-Za-z0-9_]*)*)\s*\(/g;
  let m;
  while ((m = re.exec(cleaned)) !== null) {
    const name = m[1];
    if (!wanted.has(name) || found.has(name)) continue;

    // Must not be a member call (obj.f(...) / obj->f(...)).
    const before = cleaned.slice(Math.max(0, m.index - 2), m.index);
    if (before.endsWith(".") || before.endsWith("->")) continue;

    const openParen = m.index + m[0].length - 1;
    const closeParen = matchParen(cleaned, openParen);
    if (closeParen < 0) continue;

    // After the parameter list a definition has an optional specifier run, then '{'.
    let j = closeParen + 1;
    for (;;) {
      while (j < cleaned.length && /\s/.test(cleaned[j])) j += 1;
      const spec = /^(const|override|final|noexcept|volatile)\b/.exec(cleaned.slice(j, j + 12));
      if (spec) {
        j += spec[0].length;
        continue;
      }
      break;
    }
    if (cleaned[j] !== "{") continue; // a declaration or a call site, not a definition

    const bodyEnd = matchBrace(cleaned, j);
    if (bodyEnd < 0) continue;

    found.set(name, {
      name,
      params: parseParams(src.slice(openParen + 1, closeParen)),
      bodySrc: src.slice(j, bodyEnd + 1),
      bodyStart: j,
      defStart: m.index,
      defEnd: bodyEnd + 1,
    });
    if (found.size === wanted.size) break;
  }
  return found;
}

/**
 * Names called inside a body that need resolving to a definition.
 *
 * Excludes three things that look like free calls but are not:
 *   obj.f() / obj->f()   member calls, provided by the host object
 *   ns::f()              qualified names, resolved through the host's std::/rclcpp:: tables
 *   auto f = [&](...)    lambdas declared locally in the same body
 */
function calledNames(cleanedBody) {
  const localLambdas = new Set();
  const lambdaRe = /\b(?:auto|const\s+auto)\s*&?\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\[/g;
  let lm;
  while ((lm = lambdaRe.exec(cleanedBody)) !== null) localLambdas.add(lm[1]);

  const out = new Set();
  const re = /([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
  let m;
  while ((m = re.exec(cleanedBody)) !== null) {
    const before = cleanedBody.slice(Math.max(0, m.index - 2), m.index);
    if (before.endsWith(".") || before.endsWith("->") || before.endsWith("::")) continue;
    if (CPP_KEYWORDS.has(m[1])) continue;
    if (localLambdas.has(m[1])) continue;
    out.add(m[1]);
  }
  return out;
}

/**
 * Extract the whitelisted functions plus, transitively, any free helper they call that
 * is defined in the same paste and is not already a host built-in.
 *
 * @param {string} src        the raw paste
 * @param {Set<string>} hostNames names the runtime already provides natively
 */
export function extractFunctions(src, hostNames) {
  const cleaned = blankNonCode(src);
  const functions = new Map();
  const notFound = [];

  const primary = findFunctionDefinitions(src, cleaned, WHITELIST);
  for (const name of WHITELIST) {
    if (primary.has(name)) functions.set(name, { ...primary.get(name), role: "whitelisted" });
    else notFound.push(name);
  }

  // Transitive dependency pass.
  const dependencies = [];
  let frontier = [...functions.values()];
  for (let depth = 0; depth < MAX_DEPENDENCY_DEPTH && frontier.length; depth += 1) {
    const wanted = new Set();
    for (const fn of frontier) {
      const bodyCleaned = cleaned.slice(fn.bodyStart, fn.defEnd);
      for (const called of calledNames(bodyCleaned)) {
        if (functions.has(called)) continue;
        if (hostNames.has(called)) continue;
        // Class::method definitions are not reachable as bare calls; skip qualified forms.
        wanted.add(called);
      }
    }
    if (wanted.size === 0) break;
    const found = findFunctionDefinitions(src, cleaned, [...wanted]);
    frontier = [];
    for (const [name, fn] of found) {
      const entry = { ...fn, role: "dependency" };
      functions.set(name, entry);
      dependencies.push(name);
      frontier.push(entry);
    }
  }

  let extractedChars = 0;
  for (const fn of functions.values()) extractedChars += fn.defEnd - fn.defStart;

  return {
    functions,
    notFound,
    dependencies,
    cleaned,
    stats: {
      totalChars: src.length,
      totalLines: src ? src.split("\n").length : 0,
      extractedChars,
      extractedLines: [...functions.values()].reduce(
        (acc, fn) => acc + fn.bodySrc.split("\n").length,
        0
      ),
      percent: src.length ? (extractedChars / src.length) * 100 : 0,
    },
  };
}

/**
 * File-scope variables, e.g. `bool g_adjustWatchdogTimeout = false;` at brain_tree.cpp:21
 * and the `static constexpr double GOALIE_*` block.
 *
 * These matter: g_adjustWatchdogTimeout is the handshake between Adjust's session
 * watchdog and StrikerDecide's cooldown. If each node got its own copy the handshake
 * would silently never fire, so they are hoisted into one shared global table.
 *
 * @returns {Array<{name: string, initSrc: string, pos: number}>}
 */
export function extractFileScopeVars(src, cleaned) {
  // Collect the spans at file scope. `namespace X { ... }` and the anonymous
  // `namespace { ... }` are transparent -- brain_tree.cpp declares
  // g_adjustWatchdogTimeout inside an anonymous namespace at line 21, and it is very
  // much a file-scope variable.
  const spans = [];
  const braceIsTransparent = [];
  let depth = 0;
  let spanStart = 0;

  for (let i = 0; i < cleaned.length; i += 1) {
    const c = cleaned[i];
    if (c === "{") {
      // Look back past an optional namespace name for the `namespace` keyword.
      const before = cleaned.slice(Math.max(0, i - 64), i);
      const transparent = /\bnamespace\s*(?:[A-Za-z_][A-Za-z0-9_]*\s*)?$/.test(before);
      braceIsTransparent.push(transparent);
      if (!transparent) {
        if (depth === 0) spans.push([spanStart, i]);
        depth += 1;
      }
    } else if (c === "}") {
      const transparent = braceIsTransparent.pop();
      if (!transparent) {
        depth -= 1;
        if (depth <= 0) {
          depth = 0;
          spanStart = i + 1;
        }
      }
    }
  }
  spans.push([spanStart, cleaned.length]);

  // Anchored on a statement boundary (start of chunk, ';', '}' or a newline) so this
  // cannot match a declaration nested inside a parameter list or an expression.
  const declRe =
    /(?:^|[;}\n])[ \t]*(?:static\s+|extern\s+)?(?:constexpr\s+|const\s+)*(?:bool|double|float|int|long|short|string|size_t|unsigned|auto)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([^;]+);/g;

  const out = [];
  const seen = new Set();
  for (const [from, to] of spans) {
    const chunkClean = cleaned.slice(from, to);
    let m;
    declRe.lastIndex = 0;
    while ((m = declRe.exec(chunkClean)) !== null) {
      const name = m[1];
      if (seen.has(name)) continue;
      // Take the initialiser from the ORIGINAL text so string literals survive.
      const initStart = from + m.index + m[0].indexOf("=", m[0].indexOf(name)) + 1;
      const initEnd = from + m.index + m[0].length - 1;
      const initSrc = src.slice(initStart, initEnd).trim();
      if (!initSrc) continue;
      seen.add(name);
      out.push({ name, initSrc, pos: initStart });
    }
  }
  return out;
}

/**
 * Port names a function reads through getInput(), found statically.
 *
 * Matches both forms used in the code:
 *   getInput("vx_limit", vxLimit)
 *   getInput<double>("min_msec_kick").value()
 *   node.getInput("dist", dist)
 *
 * Knowing these before the run matters: an unresolved port silently became 0, and a 0
 * where the header says 4000 (Adjust's session_timeout_ms) makes the watchdog fire on
 * the first tick and disables the whole node. Better to block the run and say so.
 */
export function requestedPorts(bodySrc) {
  // Blank comments only -- the string literals are exactly what we are reading, and a
  // commented-out getInput must not be reported as a required port.
  const src = blankComments(bodySrc);
  const names = new Set();
  const callRe = /\bgetInput\s*(?:<[^>]*>)?\s*\(\s*"([^"]*)"/g;
  let m;
  while ((m = callRe.exec(src)) !== null) {
    if (m[1]) names.add(m[1]);
  }
  return [...names];
}

/** Replace comments with spaces, leaving string literals intact. */
function blankComments(src) {
  const out = src.split("");
  let i = 0;
  const n = src.length;
  const blank = (from, to) => {
    for (let k = from; k < to; k += 1) if (out[k] !== "\n") out[k] = " ";
  };
  while (i < n) {
    const ch = src[i];
    if (ch === "/" && src[i + 1] === "/") {
      const start = i;
      while (i < n && src[i] !== "\n") i += 1;
      blank(start, i);
      continue;
    }
    if (ch === "/" && src[i + 1] === "*") {
      const start = i;
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i += 1;
      i = Math.min(i + 2, n);
      blank(start, i);
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i += 1;
      while (i < n && src[i] !== quote) i += src[i] === "\\" ? 2 : 1;
      i += 1;
      continue;
    }
    i += 1;
  }
  return out.join("");
}

/** Unresolved call targets after extraction — reported, not fatal. */
export function unresolvedCalls(functions, cleaned, hostNames) {
  const missing = new Set();
  for (const fn of functions.values()) {
    const bodyCleaned = cleaned.slice(fn.bodyStart, fn.defEnd);
    for (const called of calledNames(bodyCleaned)) {
      if (functions.has(called)) continue;
      if (hostNames.has(called)) continue;
      missing.add(called);
    }
  }
  return [...missing].sort();
}
