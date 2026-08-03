// Tree-walking evaluator for the C++ subset.
//
// Dynamically typed: every value is a JS number, string, boolean, plain object (struct)
// or function. Declared type names are used only to build a default value for an
// uninitialised variable and to map brace-init lists onto struct fields.
//
// Two pieces of C++ state have to survive across calls, and both do:
//   * `static` locals inside a function      -> this.statics, keyed by function + position
//   * node class members (_frozenKickDir...) -> this.nodeState, per node instance
// Both are cleared by reset(), which the simulator calls on Reset.

export class RuntimeError extends Error {
  constructor(message, pos) {
    super(message);
    this.name = "RuntimeError";
    this.pos = pos;
  }
}

// Completion signals. Returned rather than thrown: cheaper, and this runs 100x/second.
const NORMAL = undefined;
const BREAK = { signal: "break" };
const CONTINUE = { signal: "continue" };
function returnSignal(value) {
  return { signal: "return", value };
}

class Scope {
  constructor(parent) {
    this.vars = new Map();
    this.parent = parent;
  }
  lookup(name) {
    let s = this;
    while (s) {
      const box = s.vars.get(name);
      if (box !== undefined) return box;
      s = s.parent;
    }
    return null;
  }
  declare(name, box) {
    this.vars.set(name, box);
    return box;
  }
}

const CONTAINER_NOOPS = new Set([
  "push_back", "emplace_back", "pop_back", "clear", "reserve", "resize", "insert", "erase",
]);

/**
 * A stand-in for a value of a type the simulator does not model -- ROS message types
 * such as visualization_msgs::msg::MarkerArray, which the decision nodes build purely to
 * publish for rviz.
 *
 * Field access auto-creates further opaque values (so `marker_array.markers.push_back(m)`
 * works), container mutators are no-ops, and it reads as 0 in arithmetic. Only ever used
 * for types that are neither a known struct nor a scalar, so it cannot mask a mistake in
 * code the simulator actually models.
 */
function makeOpaqueStruct() {
  const store = new Map();
  const target = {};
  return new Proxy(target, {
    get(t, prop) {
      if (typeof prop === "symbol") {
        if (prop === Symbol.toPrimitive) return () => 0;
        return undefined;
      }
      if (prop === "valueOf") return () => 0;
      if (prop === "toString") return () => "";
      if (CONTAINER_NOOPS.has(prop)) return () => 0;
      if (prop === "size" || prop === "length") return () => 0;
      if (prop === "empty") return () => true;
      if (!store.has(prop)) store.set(prop, makeOpaqueStruct());
      return store.get(prop);
    },
    set(t, prop, value) {
      store.set(prop, value);
      return true;
    },
    has: () => true,
    ownKeys: () => [...store.keys()],
    getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
  });
}

/** Default value for a declaration with no initialiser. */
function defaultForType(typeName, structLayouts) {
  const t = (typeName || "").replace(/\b(const|constexpr|static|mutable|volatile|inline)\b/g, "").trim();
  if (!t) return 0;
  if (t === "bool") return false;
  if (t === "string" || t === "std::string") return "";
  if (
    /\b(double|float|int|long|short|size_t|unsigned|signed|uint\d+_t|int\d+_t|char)\b/.test(t)
  ) {
    return 0;
  }
  const layout = structLayouts[t] || structLayouts[t.split("::").pop()];
  if (layout) {
    const obj = {};
    for (const f of layout) obj[f] = 0;
    return obj;
  }
  if (/^(vector|list|deque|set|map|array)\b/.test(t) || t.includes("vector<")) return [];
  return makeOpaqueStruct();
}

function isPlainData(v) {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  for (const k of Object.keys(v)) {
    if (typeof v[k] === "function") return false;
  }
  return true;
}

function shallowCopy(v) {
  return isPlainData(v) ? { ...v } : v;
}

/**
 * The handful of std::string / std::vector members the target functions touch.
 * `lastDecision.empty()`, `goalposts.size()`, `label.c_str()` and friends.
 */
function stlMember(obj, prop) {
  const isStr = typeof obj === "string";
  switch (prop) {
    case "empty":
      return () => obj.length === 0;
    case "size":
    case "length":
      return () => obj.length;
    case "c_str":
      return () => obj;
    case "at":
      return (i) => obj[i];
    case "back":
      return () => obj[obj.length - 1];
    case "front":
      return () => obj[0];
    case "substr":
      return (start, len) => (isStr ? obj.substr(start, len) : obj.slice(start, start + len));
    case "find":
      return (needle) => {
        const idx = isStr ? obj.indexOf(needle) : obj.indexOf(needle);
        return idx < 0 ? 4294967295 : idx; // std::string::npos
      };
    case "push_back":
      return (v) => {
        if (Array.isArray(obj)) obj.push(v);
      };
    case "clear":
      return () => {
        if (Array.isArray(obj)) obj.length = 0;
      };
    default:
      return undefined;
  }
}

// --- rclcpp::Time / rclcpp::Duration -----------------------------------------------
// Both are represented as { __time|__duration, __s: seconds } by the host. A node member
// that was never assigned defaults to the number 0, which is exactly what a
// default-constructed rclcpp::Time is, so plain numbers count as time-like too.

function isTimeLike(v) {
  return !!v && typeof v === "object" && (v.__time === true || v.__duration === true);
}
function secondsOf(v) {
  if (typeof v === "number") return v;
  if (isTimeLike(v)) return v.__s;
  return NaN;
}
function asTime(s) {
  return { __time: true, __s: s, seconds: () => s, nanoseconds: () => s * 1e9 };
}
function asDuration(s) {
  return { __duration: true, __s: s, seconds: () => s, nanoseconds: () => s * 1e9 };
}
function timeArithmetic(op, a, b) {
  const sa = secondsOf(a);
  const sb = secondsOf(b);
  if (Number.isNaN(sa) || Number.isNaN(sb)) return undefined;
  switch (op) {
    case "-":
      // Time - Time yields a Duration; Time - Duration yields a Time.
      return b && b.__duration ? asTime(sa - sb) : asDuration(sa - sb);
    case "+":
      return asTime(sa + sb);
    case "<": return sa < sb;
    case ">": return sa > sb;
    case "<=": return sa <= sb;
    case ">=": return sa >= sb;
    case "==": return sa === sb;
    case "!=": return sa !== sb;
    default:
      return undefined;
  }
}

/**
 * Is this really an AST for a parsed function?
 *
 * Host stand-ins are Proxies that answer every property access, so a bare
 * `fn.__parsedFunction` truthiness test is not enough -- it would hand the evaluator a
 * proxy where a Block was expected.
 */
function isParsedFunction(v) {
  return !!v && typeof v === "object" && !!v.body && Array.isArray(v.body.body);
}

function truthy(v) {
  if (typeof v === "number") return v !== 0;
  if (typeof v === "boolean") return v;
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.length > 0;
  return true;
}

export class Interpreter {
  /**
   * @param {object} opts
   * @param {object} opts.globals        host built-ins and extracted user functions
   * @param {object} opts.structLayouts  { Pose2D: ["x","y","theta"], ... }
   * @param {(name:string)=>void} opts.onUnknownSymbol
   * @param {number} opts.stepBudget     max AST evaluations per invoke()
   */
  constructor({
    globals,
    structLayouts = {},
    onUnknownSymbol = null,
    stepBudget = 2000000,
    watchNames = null,
  }) {
    this.globals = globals;
    this.structLayouts = structLayouts;
    this.onUnknownSymbol = onUnknownSymbol;
    this.stepBudget = stepBudget;

    // Telemetry: names whose value is captured whenever the interpreted code assigns
    // them. This is how the simulator reports target_f / targetType / the Bezier control
    // points -- they are read out of the running code, not recomputed alongside it.
    this.watchNames = watchNames;
    this.watched = {};

    this.statics = new Map(); // "fnKey#pos" -> box
    this.nodeState = new Map(); // "nodeKey.member" -> box
    this.currentNodeKey = "global";
    this.steps = 0;
    this.unknownSymbols = new Set();
  }

  reset() {
    this.statics.clear();
    this.nodeState.clear();
    this.unknownSymbols.clear();
  }

  /** Seed node member initial values parsed out of brain_tree.h. */
  seedNodeMembers(nodeKey, members) {
    for (const name of Object.keys(members)) {
      this.nodeState.set(`${nodeKey}.${name}`, { v: members[name] });
    }
  }

  /**
   * Call a parsed function.
   * @param {object} fn      { kind:"Function", params, body }
   * @param {any[]} args
   * @param {string} nodeKey which node instance owns the member state ("Adjust", ...)
   */
  invoke(fn, args, nodeKey = "global") {
    const prevNode = this.currentNodeKey;
    this.currentNodeKey = nodeKey;
    this.steps = 0;
    try {
      const scope = new Scope(null);
      fn.params.forEach((p, idx) => {
        scope.declare(p, { v: args[idx] });
      });
      const out = this.execBlock(fn.body, new Scope(scope), fn.key || "fn");
      return out && out.signal === "return" ? out.value : undefined;
    } finally {
      this.currentNodeKey = prevNode;
    }
  }

  tick() {
    this.steps += 1;
    if (this.steps > this.stepBudget) {
      throw new RuntimeError(
        `execution budget exceeded (${this.stepBudget} steps in one tick) — likely an infinite loop`,
        0
      );
    }
  }

  // ------------------------------------------------------------- statements

  execBlock(block, scope, fnKey) {
    for (const stmt of block.body) {
      const out = this.exec(stmt, scope, fnKey);
      if (out !== NORMAL) return out;
    }
    return NORMAL;
  }

  exec(node, scope, fnKey) {
    this.tick();
    switch (node.kind) {
      case "Block":
        return this.execBlock(node, new Scope(scope), fnKey);

      case "Empty":
        return NORMAL;

      case "ExprStatement":
        this.eval(node.expr, scope, fnKey);
        return NORMAL;

      case "VarDecl":
        return this.execVarDecl(node, scope, fnKey);

      case "If":
        if (truthy(this.eval(node.test, scope, fnKey))) {
          return this.exec(node.consequent, scope, fnKey);
        }
        if (node.alternate) return this.exec(node.alternate, scope, fnKey);
        return NORMAL;

      case "While": {
        while (truthy(this.eval(node.test, scope, fnKey))) {
          this.tick();
          const out = this.exec(node.body, scope, fnKey);
          if (out === BREAK) break;
          if (out !== NORMAL && out !== CONTINUE) return out;
        }
        return NORMAL;
      }

      case "DoWhile": {
        do {
          this.tick();
          const out = this.exec(node.body, scope, fnKey);
          if (out === BREAK) break;
          if (out !== NORMAL && out !== CONTINUE) return out;
        } while (truthy(this.eval(node.test, scope, fnKey)));
        return NORMAL;
      }

      case "For": {
        const loopScope = new Scope(scope);
        if (node.init) this.exec(node.init, loopScope, fnKey);
        for (;;) {
          this.tick();
          if (node.test && !truthy(this.eval(node.test, loopScope, fnKey))) break;
          const out = this.exec(node.body, loopScope, fnKey);
          if (out === BREAK) break;
          if (out !== NORMAL && out !== CONTINUE) return out;
          if (node.update) this.eval(node.update, loopScope, fnKey);
        }
        return NORMAL;
      }

      case "Switch": {
        const disc = this.eval(node.disc, scope, fnKey);
        const switchScope = new Scope(scope);
        let matched = false;
        for (const stmt of node.body.body) {
          if (stmt.kind === "Case") {
            if (!matched) {
              matched =
                stmt.test === null || this.eval(stmt.test, switchScope, fnKey) === disc;
            }
            continue;
          }
          if (!matched) continue;
          const out = this.exec(stmt, switchScope, fnKey);
          if (out === BREAK) return NORMAL;
          if (out !== NORMAL && out !== CONTINUE) return out;
        }
        return NORMAL;
      }

      case "Case":
        return NORMAL; // handled by Switch

      case "Return":
        return returnSignal(node.arg ? this.eval(node.arg, scope, fnKey) : undefined);

      case "Break":
        return BREAK;

      case "Continue":
        return CONTINUE;

      default:
        throw new RuntimeError(`unsupported statement '${node.kind}'`, node.pos);
    }
  }

  execVarDecl(node, scope, fnKey) {
    for (const d of node.declarations) {
      if (node.isStatic) {
        // One persistent box per textual declaration, initialised on first execution.
        const key = `${fnKey}#${d.pos}`;
        let box = this.statics.get(key);
        if (box === undefined) {
          box = { v: this.initValue(node, d, scope, fnKey) };
          this.statics.set(key, box);
        }
        scope.declare(d.name, box);
      } else {
        const value = this.initValue(node, d, scope, fnKey);
        scope.declare(d.name, { v: value });
        if (this.watchNames && this.watchNames.has(d.name)) this.watched[d.name] = value;
      }
    }
    return NORMAL;
  }

  initValue(declNode, d, scope, fnKey) {
    if (!d.init) {
      // Default-construct through the host when it knows the type, so
      // `std::ostringstream ss;` yields a real stream rather than an opaque value.
      const t = (declNode.typeName || "")
        .replace(/\b(const|constexpr|static|mutable|volatile|inline)\b/g, "")
        .trim();
      const ctor = this.globals[t] || this.globals[t.split("::").pop()];
      if (typeof ctor === "function" && !this.structLayouts[t]) return ctor();
      return defaultForType(t, this.structLayouts);
    }
    if (d.init.kind === "InitList") {
      return this.buildStruct(declNode.typeName, d.init, scope, fnKey);
    }
    if (d.init.kind === "Construct") {
      const args = d.init.args.map((a) => this.eval(a, scope, fnKey));
      return this.construct(d.init.type, args, d.init.pos);
    }
    return shallowCopy(this.eval(d.init, scope, fnKey));
  }

  buildStruct(typeName, initList, scope, fnKey) {
    const t = (typeName || "").replace(/\b(const|constexpr|static)\b/g, "").trim();
    const layout = this.structLayouts[t] || this.structLayouts[t.split("::").pop()];
    const values = initList.elements.map((e) =>
      e.kind === "InitList" ? this.buildStruct("", e, scope, fnKey) : this.eval(e, scope, fnKey)
    );
    if (!layout) {
      throw new RuntimeError(
        `brace initialisation of unknown type '${t || "?"}' — this interpreter only knows ` +
          `${Object.keys(this.structLayouts).join(", ")}`,
        initList.pos
      );
    }
    const obj = {};
    layout.forEach((field, idx) => {
      obj[field] = idx < values.length ? values[idx] : 0;
    });
    return obj;
  }

  construct(typeName, args, pos) {
    const ctor = this.globals[typeName] || this.globals[typeName.split("::").pop()];
    if (typeof ctor === "function") return ctor(...args);
    const layout = this.structLayouts[typeName] || this.structLayouts[typeName.split("::").pop()];
    if (layout) {
      const obj = {};
      layout.forEach((f, i) => {
        obj[f] = i < args.length ? args[i] : 0;
      });
      return obj;
    }
    // Unmodelled type: hand back an opaque value and report it, rather than aborting a
    // tick over something like a ROS message constructor.
    if (!this.unknownSymbols.has(typeName)) {
      this.unknownSymbols.add(typeName);
      if (this.onUnknownSymbol) this.onUnknownSymbol(`${typeName} (type)`, this.currentNodeKey);
    }
    void pos;
    return makeOpaqueStruct();
  }

  // ------------------------------------------------------------ expressions

  eval(node, scope, fnKey) {
    this.tick();
    switch (node.kind) {
      case "Literal":
        return node.value;

      case "Identifier":
        return this.resolve(node, scope).get();

      case "Member":
        return this.evalMember(node, scope, fnKey);

      case "Index": {
        const obj = this.eval(node.object, scope, fnKey);
        const idx = this.eval(node.index, scope, fnKey);
        if (obj === null || obj === undefined) {
          throw new RuntimeError("indexing a null value", node.pos);
        }
        return obj[idx];
      }

      case "Call":
        return this.evalCall(node, scope, fnKey);

      case "Assign":
        return this.evalAssign(node, scope, fnKey);

      case "Update": {
        const ref = this.reference(node.arg, scope, fnKey);
        const old = ref.get();
        const next = node.op === "++" ? old + 1 : old - 1;
        ref.set(next);
        return node.prefix ? next : old;
      }

      case "Unary": {
        const v = this.eval(node.arg, scope, fnKey);
        switch (node.op) {
          case "-": return -v;
          case "+": return +v;
          case "!": return !truthy(v);
          case "~": return ~v;
          default:
            throw new RuntimeError(`unsupported unary operator '${node.op}'`, node.pos);
        }
      }

      case "Binary":
        return this.evalBinary(node, scope, fnKey);

      case "Conditional":
        return truthy(this.eval(node.test, scope, fnKey))
          ? this.eval(node.consequent, scope, fnKey)
          : this.eval(node.alternate, scope, fnKey);

      case "Sequence":
        this.eval(node.left, scope, fnKey);
        return this.eval(node.right, scope, fnKey);

      case "Cast": {
        const v = this.eval(node.arg, scope, fnKey);
        const t = String(node.typeName || "");
        if (/\b(int|long|short|size_t|uint\d+_t|int\d+_t)\b/.test(t)) return Math.trunc(v);
        if (/\bbool\b/.test(t)) return truthy(v);
        if (/\b(double|float)\b/.test(t)) return Number(v);
        return v;
      }

      case "Lambda": {
        const defining = scope;
        const self = this;
        const fn = function lambda(...args) {
          const s = new Scope(defining);
          node.params.forEach((p, i) => s.declare(p, { v: args[i] }));
          const out = self.execBlock(node.body, new Scope(s), fnKey);
          return out && out.signal === "return" ? out.value : undefined;
        };
        fn.__interpreted = true;
        return fn;
      }

      case "InitList":
        // A bare brace list outside a typed declaration: yield an array; callers that
        // know the type (e.g. a function argument) convert it.
        return node.elements.map((e) => this.eval(e, scope, fnKey));

      default:
        throw new RuntimeError(`unsupported expression '${node.kind}'`, node.pos);
    }
  }

  evalBinary(node, scope, fnKey) {
    const op = node.op;
    // Short-circuit before evaluating the right operand.
    if (op === "&&") {
      return truthy(this.eval(node.left, scope, fnKey))
        ? truthy(this.eval(node.right, scope, fnKey))
        : false;
    }
    if (op === "||") {
      return truthy(this.eval(node.left, scope, fnKey))
        ? true
        : truthy(this.eval(node.right, scope, fnKey));
    }

    const a = this.eval(node.left, scope, fnKey);
    const b = this.eval(node.right, scope, fnKey);

    // Stream insertion: `ss << std::fixed << std::setprecision(2) << "x: " << value`.
    // Only used to build log strings, but it appears in several nodes.
    if (op === "<<" && a && typeof a === "object" && a.__stream === true) {
      a.write(b);
      return a;
    }

    // rclcpp::Time / Duration arithmetic. TickChaseNode's rate limiter does
    // `(nowTime - lastCallTime).seconds()`, and several nodes do
    // `now - rclcpp::Duration::from_seconds(3600.0)`.
    if (isTimeLike(a) || isTimeLike(b)) {
      const result = timeArithmetic(op, a, b);
      if (result !== undefined) return result;
    }

    switch (op) {
      case "+":
        if (typeof a === "string" || typeof b === "string") return String(a) + String(b);
        return a + b;
      case "-": return a - b;
      case "*": return a * b;
      case "/": return a / b;
      case "%": return a % b;
      case "==": return a === b;
      case "!=": return a !== b;
      case "<": return a < b;
      case ">": return a > b;
      case "<=": return a <= b;
      case ">=": return a >= b;
      case "&": return a & b;
      case "|": return a | b;
      case "^": return a ^ b;
      case "<<":
        // `os << x` stream insertion is not supported; only integer shifts are.
        return a << b;
      case ">>": return a >> b;
      default:
        throw new RuntimeError(`unsupported operator '${op}'`, node.pos);
    }
  }

  evalAssign(node, scope, fnKey) {
    const ref = this.reference(node.target, scope, fnKey);
    let value;
    if (node.op === "=" && node.value.kind === "InitList") {
      // `someStructField = {a, b, c};` -- a brace-init used as a plain REASSIGNMENT,
      // not a fresh declaration. buildStruct() (used by VarDecl) knows the target type
      // from the declaration's type name, but a bare assignment has no such annotation
      // here -- the interpreter is dynamically typed and Member/Identifier targets carry
      // no static type. The only type information available is the CURRENT value already
      // sitting there: if it looks like a struct (a plain object with known field names --
      // e.g. a Point/Pose2D the host or an earlier declaration populated), map the
      // brace-init positionally onto those same field names, exactly like a struct
      // constructor call. Otherwise fall back to a plain array, which is what an
      // uninterpreted `{...}` naturally is.
      //
      // Concretely: `brain->data->goalBlockingTarget = {setX, setY, 0.0};` where
      // goalBlockingTarget already holds {x,y,z} (from host.js) must produce
      // {x:setX, y:setY, z:0.0}, not the array [setX, setY, 0.0] -- an array has no
      // `.x`/`.y`, so every subsequent `goalBlockingTarget.x` read downstream silently
      // becomes undefined.
      const current = ref.get();
      value = this.evalInitListLike(node.value, current, scope, fnKey);
    } else {
      value = this.eval(node.value, scope, fnKey);
    }
    if (node.op !== "=") {
      const old = ref.get();
      switch (node.op) {
        case "+=":
          value = typeof old === "string" || typeof value === "string"
            ? String(old) + String(value)
            : old + value;
          break;
        case "-=": value = old - value; break;
        case "*=": value = old * value; break;
        case "/=": value = old / value; break;
        case "%=": value = old % value; break;
        case "&=": value = old & value; break;
        case "|=": value = old | value; break;
        case "^=": value = old ^ value; break;
        case "<<=": value = old << value; break;
        case ">>=": value = old >> value; break;
        default:
          throw new RuntimeError(`unsupported assignment '${node.op}'`, node.pos);
      }
    }
    ref.set(value);
    if (this.watchNames) {
      // Watch both `targetType = "direct"` and `target_f.x = ...`.
      if (node.target.kind === "Identifier" && this.watchNames.has(node.target.name)) {
        this.watched[node.target.name] = value;
      } else if (
        node.target.kind === "Member" &&
        node.target.object.kind === "Identifier" &&
        this.watchNames.has(node.target.object.name)
      ) {
        this.watched[node.target.object.name] = this.eval(node.target.object, scope, fnKey);
      }
    }
    return value;
  }

  /**
   * Evaluate a brace-init list for a plain assignment target, inferring the struct shape
   * from whatever value is already there. See the comment in evalAssign for why this
   * exists. Falls back to a plain array when the current value gives no shape to map onto.
   */
  evalInitListLike(initListNode, currentValue, scope, fnKey) {
    const evalElement = (e) =>
      e.kind === "InitList" ? this.evalInitListLike(e, undefined, scope, fnKey) : this.eval(e, scope, fnKey);
    const values = initListNode.elements.map(evalElement);

    if (isPlainData(currentValue)) {
      const keys = Object.keys(currentValue);
      if (keys.length > 0) {
        const obj = {};
        keys.forEach((k, i) => {
          obj[k] = i < values.length ? values[i] : currentValue[k];
        });
        return obj;
      }
    }
    return values;
  }

  evalMember(node, scope, fnKey) {
    const obj = this.eval(node.object, scope, fnKey);
    if (obj === null || obj === undefined) {
      throw new RuntimeError(
        `cannot read '${node.property}' of a null value`,
        node.pos
      );
    }
    if (typeof obj === "string" || Array.isArray(obj)) {
      const stl = stlMember(obj, node.property);
      if (stl !== undefined) return stl;
    }
    if (typeof obj === "number") {
      // A default-constructed rclcpp::Time member starts as 0; keep .seconds() working.
      if (node.property === "seconds") return () => obj;
      if (node.property === "nanoseconds") return () => obj * 1e9;
    }
    const v = obj[node.property];
    if (typeof v === "function") {
      // Bind so `brain->client->setVelocity` keeps its receiver when called. Proxied
      // stand-ins can return something other than a function from .bind(), so fall back
      // to the raw value rather than blowing up on the property write below.
      let bound;
      try {
        bound = v.bind(obj);
      } catch {
        return v;
      }
      if (typeof bound !== "function") return v;
      bound.refParams = v.refParams;
      bound.__raw = v;
      if (isParsedFunction(v.__parsedFunction)) {
        bound.__parsedFunction = v.__parsedFunction;
        bound.__nodeKey = v.__nodeKey;
      }
      return bound;
    }
    return v;
  }

  evalCall(node, scope, fnKey) {
    const callee = node.callee;

    let fn;
    let templateArgs = null;
    if (callee.kind === "Member") {
      fn = this.evalMember(callee, scope, fnKey);
      templateArgs = callee.templateArgs;
    } else if (callee.kind === "Identifier") {
      const ref = this.resolve(callee, scope, /* forCall */ true);
      fn = ref.get();
      templateArgs = callee.templateArgs;
    } else {
      fn = this.eval(callee, scope, fnKey);
    }

    if (typeof fn !== "function") {
      const name = callee.kind === "Identifier" ? callee.name : callee.property || "?";
      throw new RuntimeError(`'${name}' is not a function`, node.pos);
    }

    const refParams = fn.refParams || (fn.__raw && fn.__raw.refParams) || null;
    const args = node.args.map((a, idx) => {
      if (refParams && refParams.includes(idx)) return this.reference(a, scope, fnKey);
      if (a.kind === "InitList") return this.eval(a, scope, fnKey);
      return this.eval(a, scope, fnKey);
    });

    if (isParsedFunction(fn.__parsedFunction)) {
      return this.invoke(fn.__parsedFunction, args, fn.__nodeKey || this.currentNodeKey);
    }
    if (templateArgs && fn.wantsTemplateArgs) {
      return fn(...args, { templateArgs });
    }
    return fn(...args);
  }

  /** Resolve an identifier to a box, creating node-member state on first sight. */
  resolve(node, scope, forCall = false) {
    const name = node.name;
    const box = scope.lookup(name);
    if (box) return { get: () => box.v, set: (v) => { box.v = v; } };

    if (Object.prototype.hasOwnProperty.call(this.globals, name)) {
      const g = this.globals;
      return { get: () => g[name], set: (v) => { g[name] = v; } };
    }

    // Qualified names that the host exposes under the bare tail (std::max -> max)
    if (name.includes("::")) {
      const tail = name.split("::").pop();
      if (Object.prototype.hasOwnProperty.call(this.globals, tail)) {
        const g = this.globals;
        return { get: () => g[tail], set: (v) => { g[tail] = v; } };
      }
    }

    if (forCall) {
      throw new RuntimeError(
        `unknown function '${name}' — it is neither a host built-in nor present in the pasted code`,
        node.pos
      );
    }

    // Unresolved non-call identifier: treat it as node member state (the real code has
    // plenty, e.g. _frozenKickDir, timeLastKickExit, lastDeltaDir). Default 0, and
    // report it so the diagnostics panel can list what was assumed.
    const key = `${this.currentNodeKey}.${name}`;
    let mbox = this.nodeState.get(key);
    if (mbox === undefined) {
      mbox = { v: 0 };
      this.nodeState.set(key, mbox);
      if (!this.unknownSymbols.has(name)) {
        this.unknownSymbols.add(name);
        if (this.onUnknownSymbol) this.onUnknownSymbol(name, this.currentNodeKey);
      }
    }
    return { get: () => mbox.v, set: (v) => { mbox.v = v; } };
  }

  /** Build a settable reference for an lvalue expression. */
  reference(node, scope, fnKey) {
    switch (node.kind) {
      case "Identifier":
        return this.resolve(node, scope);
      case "Member": {
        const obj = this.eval(node.object, scope, fnKey);
        if (obj === null || obj === undefined) {
          throw new RuntimeError(`cannot assign to '${node.property}' of a null value`, node.pos);
        }
        return {
          get: () => obj[node.property],
          set: (v) => { obj[node.property] = v; },
        };
      }
      case "Index": {
        const obj = this.eval(node.object, scope, fnKey);
        const idx = this.eval(node.index, scope, fnKey);
        return { get: () => obj[idx], set: (v) => { obj[idx] = v; } };
      }
      default:
        // Not an lvalue (e.g. a temporary passed to a by-ref parameter). Give a
        // throwaway box so the call still works.
        {
          const v = this.eval(node, scope, fnKey);
          let cur = v;
          return { get: () => cur, set: (nv) => { cur = nv; } };
        }
    }
  }
}

export { truthy, defaultForType };
