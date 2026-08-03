// Parse a BehaviorTree.CPP subtree XML into per-node port values.
//
// This is what makes the interpreted getInput("vx_limit", v) calls resolve: the C++ reads
// its tuning from ports declared on the XML tag, e.g.
//   <StrikerChase vx_limit="1.2" dist="0.38" curve_lateral_gain="1.0" ... />

/** Attributes that are BehaviorTree.CPP plumbing, not node parameters. */
const PLUMBING = new Set(["ID", "name", "_while", "_skipIf", "_onSuccess", "_onFailure", "_post", "_autoremap"]);

/**
 * Decision values named in a `_while` guard, e.g. _while="decision == 'cross'" -> ["cross"].
 * Used to tell sibling instances of the same node apart.
 */
function guardedDecisions(whileExpr) {
  if (!whileExpr) return [];
  const out = [];
  const re = /'([^']*)'|"([^"]*)"/g;
  let m;
  while ((m = re.exec(whileExpr)) !== null) out.push(m[1] !== undefined ? m[1] : m[2]);
  return out;
}

function coerce(raw) {
  const t = raw.trim();
  if (t === "true") return true;
  if (t === "false") return false;
  // Blackboard reference like "{decision}" stays a string; the host resolves it.
  if (/^-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) return Number(t);
  return t;
}

/**
 * Extract per-tag attributes.
 *
 * A flat tag scan rather than a DOM walk: BT XML nesting is irrelevant here (we only
 * need "what ports does the <Adjust> tag carry"), and this keeps the module usable
 * outside a browser. DOMParser, when available, is used only to surface syntax errors.
 *
 * @returns {{ ports: Record<string, Record<string, any>>, nodes: string[], error: string|null }}
 */
export function parseBehaviorXml(xmlText) {
  if (!xmlText || !xmlText.trim()) {
    return { ports: {}, nodes: [], error: null };
  }

  let error = null;
  if (typeof DOMParser !== "undefined") {
    try {
      const doc = new DOMParser().parseFromString(xmlText, "application/xml");
      const bad = doc.querySelector && doc.querySelector("parsererror");
      if (bad) error = (bad.textContent || "malformed XML").trim().split("\n")[0];
    } catch (err) {
      error = String(err.message || err);
    }
  }

  // Strip comments so commented-out tags are not read as live configuration.
  const stripped = xmlText.replace(/<!--[\s\S]*?-->/g, "");

  const ports = {};
  const instances = {};
  const nodes = [];
  const tagRe = /<([A-Za-z_][A-Za-z0-9_.-]*)((?:\s+[A-Za-z_][A-Za-z0-9_.-]*\s*=\s*"[^"]*")*)\s*\/?>/g;
  const attrRe = /([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*"([^"]*)"/g;

  let m;
  while ((m = tagRe.exec(stripped)) !== null) {
    const tag = m[1];
    const attrText = m[2] || "";
    if (!attrText.trim()) continue;

    const attrs = {};
    let whileExpr = null;
    let any = false;
    let a;
    attrRe.lastIndex = 0;
    while ((a = attrRe.exec(attrText)) !== null) {
      if (a[1] === "_while") whileExpr = a[2];
      if (PLUMBING.has(a[1])) continue;
      attrs[a[1]] = coerce(a[2]);
      any = true;
    }
    if (!any) continue;

    // The same node type can appear several times with different ports and different
    // _while guards. subtree_striker_play.xml has two <Kick> tags: the shooting one sets
    // prefer_straight="true" and the straight_* tolerances, the crossing one sets none of
    // them. Merging the two would hand the cross kick a straight-kick gate it was never
    // meant to run, so each occurrence is kept separately and chosen by its guard.
    if (!instances[tag]) instances[tag] = [];
    instances[tag].push({ attrs, when: whileExpr, decisions: guardedDecisions(whileExpr) });

    // Merged view, last-wins. Used when a node has only one instance, or as a fallback.
    ports[tag] = { ...(ports[tag] || {}), ...attrs };
    if (!nodes.includes(tag)) nodes.push(tag);
  }

  if (nodes.length === 0 && !error) {
    error = "no behaviour-tree tags with attributes found — is this the right file?";
  }
  return { ports, instances, nodes, error };
}

/**
 * Pick the port set for a node given the decision currently being executed.
 * Falls back to the merged view when there is nothing to disambiguate.
 */
export function selectInstance(instances, ports, tag, decision) {
  const list = instances && instances[tag];
  if (!list || list.length <= 1) return (ports && ports[tag]) || null;
  if (decision) {
    const hit = list.find((i) => i.decisions.includes(decision));
    if (hit) return hit.attrs;
  }
  const unguarded = list.find((i) => !i.when);
  return unguarded ? unguarded.attrs : (ports && ports[tag]) || null;
}

/**
 * Resolve a port for a node, falling back to the header's providedPorts() default.
 * Returns { value, source } so the diagnostics panel can show where a number came from.
 */
export function resolvePort(nodeName, portName, xmlPorts, headerDefaults) {
  const fromXml = xmlPorts[nodeName];
  if (fromXml && Object.prototype.hasOwnProperty.call(fromXml, portName)) {
    return { value: fromXml[portName], source: "xml" };
  }
  // Chase variants inherit Chase::providedPorts().
  const inheritance = {
    StrikerChase: ["StrikerChase", "Chase"],
    GoalieChase: ["GoalieChase", "Chase"],
    DefenderChase: ["DefenderChase", "Chase"],
  };
  const chain = inheritance[nodeName] || [nodeName];
  for (const candidate of chain) {
    const defs = headerDefaults[candidate];
    if (defs && Object.prototype.hasOwnProperty.call(defs, portName)) {
      return { value: defs[portName], source: "header" };
    }
  }
  return { value: undefined, source: null };
}
