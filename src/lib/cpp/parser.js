// Recursive-descent statement parser + Pratt expression parser for the C++ subset.
//
// The AST is deliberately loose: because the interpreter is dynamically typed, type
// names are recorded on declarations (so `Pose2D p;` can be initialised to the right
// shape) but are never checked. See interpreter.js.

import { T, TYPE_KEYWORDS, tokenize } from "./lexer.js";

export class ParseError extends Error {
  constructor(message, token) {
    super(message);
    this.name = "ParseError";
    this.pos = token ? token.pos : 0;
    this.token = token;
  }
}

// Binary operator precedence, loosely following C++. Higher binds tighter.
const BINARY_PRECEDENCE = {
  "||": 1,
  "&&": 2,
  "|": 3,
  "^": 4,
  "&": 5,
  "==": 6, "!=": 6,
  "<": 7, ">": 7, "<=": 7, ">=": 7,
  "<<": 8, ">>": 8,
  "+": 9, "-": 9,
  "*": 10, "/": 10, "%": 10,
};

const ASSIGN_OPS = new Set(["=", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "<<=", ">>="]);

const CAST_KEYWORDS = new Set([
  "static_cast", "const_cast", "dynamic_cast", "reinterpret_cast",
]);

class Parser {
  constructor(tokens) {
    this.toks = tokens;
    this.i = 0;
  }

  peek(k = 0) {
    return this.toks[Math.min(this.i + k, this.toks.length - 1)];
  }
  next() {
    return this.toks[this.i++];
  }
  at(value) {
    const t = this.peek();
    return (t.type === T.PUNCT || t.type === T.IDENT) && t.value === value;
  }
  atType(type) {
    return this.peek().type === type;
  }
  eat(value) {
    if (this.at(value)) {
      this.i += 1;
      return true;
    }
    return false;
  }
  expect(value) {
    if (!this.eat(value)) {
      const t = this.peek();
      throw new ParseError(
        `expected '${value}' but found ${t.type === T.EOF ? "end of function" : `'${t.value}'`}`,
        t
      );
    }
  }

  // ---------------------------------------------------------------- statements

  parseBlock() {
    const start = this.peek();
    this.expect("{");
    const body = [];
    while (!this.at("}")) {
      if (this.atType(T.EOF)) throw new ParseError("unterminated block", start);
      body.push(this.parseStatement());
    }
    this.expect("}");
    return { kind: "Block", body, pos: start.pos };
  }

  parseStatement() {
    const t = this.peek();

    if (t.type === T.PUNCT) {
      if (t.value === "{") return this.parseBlock();
      if (t.value === ";") {
        this.next();
        return { kind: "Empty", pos: t.pos };
      }
    }

    if (t.type === T.IDENT) {
      switch (t.value) {
        case "if": return this.parseIf();
        case "for": return this.parseFor();
        case "while": return this.parseWhile();
        case "do": return this.parseDoWhile();
        case "switch": return this.parseSwitch();
        case "return": {
          this.next();
          let arg = null;
          if (!this.at(";")) arg = this.parseExpression();
          this.expect(";");
          return { kind: "Return", arg, pos: t.pos };
        }
        case "break":
          this.next();
          this.expect(";");
          return { kind: "Break", pos: t.pos };
        case "continue":
          this.next();
          this.expect(";");
          return { kind: "Continue", pos: t.pos };
        case "case": {
          this.next();
          const test = this.parseExpression();
          this.expect(":");
          return { kind: "Case", test, pos: t.pos };
        }
        case "default":
          if (this.peek(1).value === ":") {
            this.next();
            this.next();
            return { kind: "Case", test: null, pos: t.pos };
          }
          break;
        case "using":
        case "typedef":
          // `using namespace std;` and friends: skip to the semicolon.
          while (!this.at(";") && !this.atType(T.EOF)) this.next();
          this.eat(";");
          return { kind: "Empty", pos: t.pos };
        default:
          break;
      }
    }

    const decl = this.tryParseDeclaration();
    if (decl) return decl;

    const expr = this.parseExpression();
    this.expect(";");
    return { kind: "ExprStatement", expr, pos: t.pos };
  }

  parseIf() {
    const start = this.next(); // 'if'
    this.expect("(");
    const test = this.parseExpression();
    this.expect(")");
    const consequent = this.parseStatement();
    let alternate = null;
    if (this.at("else")) {
      this.next();
      alternate = this.parseStatement();
    }
    return { kind: "If", test, consequent, alternate, pos: start.pos };
  }

  parseWhile() {
    const start = this.next();
    this.expect("(");
    const test = this.parseExpression();
    this.expect(")");
    const body = this.parseStatement();
    return { kind: "While", test, body, pos: start.pos };
  }

  parseDoWhile() {
    const start = this.next();
    const body = this.parseStatement();
    this.expect("while");
    this.expect("(");
    const test = this.parseExpression();
    this.expect(")");
    this.expect(";");
    return { kind: "DoWhile", test, body, pos: start.pos };
  }

  parseSwitch() {
    const start = this.next();
    this.expect("(");
    const disc = this.parseExpression();
    this.expect(")");
    const body = this.parseBlock();
    return { kind: "Switch", disc, body, pos: start.pos };
  }

  parseFor() {
    const start = this.next();
    this.expect("(");

    // Range-for is not supported; detect it early so the message is useful.
    const save = this.i;
    let depth = 0;
    for (let k = this.i; k < this.toks.length; k += 1) {
      const tk = this.toks[k];
      if (tk.value === "(") depth += 1;
      else if (tk.value === ")") {
        if (depth === 0) break;
        depth -= 1;
      } else if (tk.value === ";" && depth === 0) break;
      else if (tk.value === ":" && depth === 0 && this.toks[k + 1] && this.toks[k + 1].value !== ":") {
        throw new ParseError("range-based for loops are not supported by this interpreter", tk);
      }
    }
    this.i = save;

    let init = null;
    if (!this.at(";")) {
      init = this.tryParseDeclaration();
      if (!init) {
        init = { kind: "ExprStatement", expr: this.parseExpression(), pos: start.pos };
        this.expect(";");
      }
    } else {
      this.expect(";");
    }
    const test = this.at(";") ? null : this.parseExpression();
    this.expect(";");
    const update = this.at(")") ? null : this.parseExpression();
    this.expect(")");
    const body = this.parseStatement();
    return { kind: "For", init, test, update, body, pos: start.pos };
  }

  // ------------------------------------------------------------- declarations

  /**
   * Try to parse a declaration. Returns null (leaving the cursor untouched) when the
   * statement is really an expression.
   *
   * Recognised shapes:
   *   double vx, vy;                    type keyword
   *   const double X = 1.0;             type keyword with qualifiers
   *   static bool flag = false;         storage class
   *   auto ball = brain->data->ball;    auto
   *   Pose2D target_f;                  IDENT IDENT       (user struct)
   *   Point2D P0 = {a, b};              IDENT IDENT = {}  (brace init)
   *   Point goalCenter{a, b, c};        IDENT IDENT {}    (direct brace init)
   *   rclcpp::Time now = ...;           qualified type name
   *   const auto &fd = ...;             reference declarator
   */
  tryParseDeclaration() {
    const save = this.i;
    const startTok = this.peek();

    const quals = { isStatic: false, isConst: false };
    let sawTypeKeyword = false;
    const typeParts = [];

    // Leading qualifiers and type keywords
    for (;;) {
      const t = this.peek();
      if (t.type !== T.IDENT) break;
      if (t.value === "static") { quals.isStatic = true; sawTypeKeyword = true; this.next(); continue; }
      if (t.value === "const" || t.value === "constexpr") { quals.isConst = true; sawTypeKeyword = true; this.next(); continue; }
      if (TYPE_KEYWORDS.has(t.value)) { sawTypeKeyword = true; typeParts.push(t.value); this.next(); continue; }
      break;
    }

    // Optional user type name, possibly qualified and/or templated
    if (this.atType(T.IDENT) && !this.isControlKeyword(this.peek().value)) {
      const before = this.i;
      const name = this.parseQualifiedName();
      if (name) {
        // Optional template arguments on the type: vector<double>, shared_ptr<X>
        this.tryParseTemplateArgs();
        typeParts.push(name);
        // For a declaration we now need a declarator: '*'/'&' then an identifier.
        let stars = 0;
        while (this.at("*") || this.at("&")) { this.next(); stars += 1; }
        void stars;
        if (!this.atType(T.IDENT) || this.isControlKeyword(this.peek().value)) {
          if (!sawTypeKeyword) {
            this.i = save;
            return null;
          }
          this.i = before;
          typeParts.pop();
        }
      }
    } else if (sawTypeKeyword) {
      while (this.at("*") || this.at("&")) this.next();
    }

    if (!sawTypeKeyword && typeParts.length === 0) {
      this.i = save;
      return null;
    }
    if (!this.atType(T.IDENT) || this.isControlKeyword(this.peek().value)) {
      this.i = save;
      return null;
    }

    // Declarators
    const declarations = [];
    for (;;) {
      while (this.at("*") || this.at("&")) this.next();
      if (!this.atType(T.IDENT)) {
        this.i = save;
        return null;
      }
      const nameTok = this.next();
      let init = null;
      let initStyle = null;

      if (this.at("[")) {
        // Array declarator: not supported, but bail cleanly rather than mis-parsing.
        this.i = save;
        return null;
      }
      if (this.eat("=")) {
        init = this.at("{") ? this.parseBraceInit() : this.parseAssignment();
        initStyle = "copy";
      } else if (this.at("{")) {
        init = this.parseBraceInit();
        initStyle = "brace";
      } else if (this.at("(")) {
        // Direct-initialisation: rclcpp::Time t(0, 0);
        this.next();
        const args = [];
        if (!this.at(")")) {
          do {
            args.push(this.parseAssignment());
          } while (this.eat(","));
        }
        this.expect(")");
        init = { kind: "Construct", type: typeParts.join(" "), args, pos: nameTok.pos };
        initStyle = "direct";
      }

      declarations.push({ name: nameTok.value, init, initStyle, pos: nameTok.pos });

      if (this.eat(",")) continue;
      break;
    }

    if (!this.eat(";")) {
      // Not actually a declaration statement (e.g. a comparison we mis-read).
      this.i = save;
      return null;
    }

    return {
      kind: "VarDecl",
      typeName: typeParts.join(" "),
      isStatic: quals.isStatic,
      isConst: quals.isConst,
      declarations,
      pos: startTok.pos,
    };
  }

  isControlKeyword(v) {
    return (
      v === "if" || v === "else" || v === "for" || v === "while" || v === "do" ||
      v === "return" || v === "break" || v === "continue" || v === "switch" ||
      v === "case" || v === "default" || v === "throw" || v === "true" || v === "false"
    );
  }

  parseQualifiedName() {
    if (!this.atType(T.IDENT)) return null;
    let name = this.next().value;
    while (this.at("::")) {
      this.next();
      if (!this.atType(T.IDENT)) throw new ParseError("expected identifier after '::'", this.peek());
      name += "::" + this.next().value;
    }
    return name;
  }

  parseBraceInit() {
    const start = this.peek();
    this.expect("{");
    const elements = [];
    if (!this.at("}")) {
      do {
        if (this.at("}")) break; // trailing comma
        elements.push(this.at("{") ? this.parseBraceInit() : this.parseAssignment());
      } while (this.eat(","));
    }
    this.expect("}");
    return { kind: "InitList", elements, pos: start.pos };
  }

  // ------------------------------------------------------------- expressions

  parseExpression() {
    let expr = this.parseAssignment();
    while (this.at(",")) {
      const start = this.next();
      const right = this.parseAssignment();
      expr = { kind: "Sequence", left: expr, right, pos: start.pos };
    }
    return expr;
  }

  parseAssignment() {
    const left = this.parseTernary();
    const t = this.peek();
    if (t.type === T.PUNCT && ASSIGN_OPS.has(t.value)) {
      this.next();
      const right = this.parseAssignment();
      return { kind: "Assign", op: t.value, target: left, value: right, pos: t.pos };
    }
    return left;
  }

  parseTernary() {
    const test = this.parseBinary(0);
    if (this.at("?")) {
      const start = this.next();
      const consequent = this.parseAssignment();
      this.expect(":");
      const alternate = this.parseAssignment();
      return { kind: "Conditional", test, consequent, alternate, pos: start.pos };
    }
    return test;
  }

  parseBinary(minPrec) {
    let left = this.parseUnary();
    for (;;) {
      const t = this.peek();
      if (t.type !== T.PUNCT) break;
      const prec = BINARY_PRECEDENCE[t.value];
      if (prec === undefined || prec < minPrec) break;
      this.next();
      const right = this.parseBinary(prec + 1);
      left = { kind: "Binary", op: t.value, left, right, pos: t.pos };
    }
    return left;
  }

  parseUnary() {
    const t = this.peek();
    if (t.type === T.PUNCT) {
      if (t.value === "!" || t.value === "-" || t.value === "+" || t.value === "~") {
        this.next();
        return { kind: "Unary", op: t.value, arg: this.parseUnary(), pos: t.pos };
      }
      if (t.value === "*" || t.value === "&") {
        // Dereference / address-of: the interpreter has no pointers, so these are
        // identity operations. `*this` and `&x` both just yield the value.
        this.next();
        return this.parseUnary();
      }
      if (t.value === "++" || t.value === "--") {
        this.next();
        return { kind: "Update", op: t.value, prefix: true, arg: this.parseUnary(), pos: t.pos };
      }
      if (t.value === "(") {
        // C-style cast to a type keyword: (double)x, (int)x
        const save = this.i;
        this.next();
        if (this.atType(T.IDENT) && TYPE_KEYWORDS.has(this.peek().value)) {
          const typeName = this.next().value;
          while (this.at("*") || this.at("&")) this.next();
          if (this.eat(")")) {
            return { kind: "Cast", typeName, arg: this.parseUnary(), pos: t.pos };
          }
        }
        this.i = save;
      }
    }
    if (t.type === T.IDENT && t.value === "sizeof") {
      // Only the sizeof(expr) form -- every real use in this codebase is the
      // sizeof(arr) / sizeof(arr[0]) array-length idiom, never a bare sizeof(TypeName).
      this.next();
      this.expect("(");
      const arg = this.parseExpression();
      this.expect(")");
      return { kind: "Sizeof", arg, pos: t.pos };
    }
    return this.parsePostfix();
  }

  parsePostfix() {
    let expr = this.parsePrimary();
    for (;;) {
      const t = this.peek();
      if (t.type !== T.PUNCT) break;
      if (t.value === "." || t.value === "->") {
        this.next();
        if (!this.atType(T.IDENT)) throw new ParseError("expected member name", this.peek());
        const prop = this.next().value;
        // Template member call: getEntry<bool>("x")
        const targs = this.tryParseTemplateArgs();
        expr = { kind: "Member", object: expr, property: prop, templateArgs: targs, pos: t.pos };
        continue;
      }
      if (t.value === "(") {
        this.next();
        const args = [];
        if (!this.at(")")) {
          do {
            args.push(this.at("{") ? this.parseBraceInit() : this.parseAssignment());
          } while (this.eat(","));
        }
        this.expect(")");
        expr = { kind: "Call", callee: expr, args, pos: t.pos };
        continue;
      }
      if (t.value === "[") {
        this.next();
        const index = this.parseExpression();
        this.expect("]");
        expr = { kind: "Index", object: expr, index, pos: t.pos };
        continue;
      }
      if (t.value === "++" || t.value === "--") {
        this.next();
        expr = { kind: "Update", op: t.value, prefix: false, arg: expr, pos: t.pos };
        continue;
      }
      break;
    }
    return expr;
  }

  parsePrimary() {
    const t = this.peek();

    if (t.type === T.NUM) {
      this.next();
      return { kind: "Literal", value: t.value, pos: t.pos };
    }
    if (t.type === T.STR || t.type === T.CHAR) {
      this.next();
      let value = t.value;
      // Adjacent string literals concatenate, as in C++.
      while (this.atType(T.STR)) value += this.next().value;
      return { kind: "Literal", value, pos: t.pos };
    }
    if (t.type === T.PUNCT && t.value === "(") {
      this.next();
      const expr = this.parseExpression();
      this.expect(")");
      return expr;
    }
    if (t.type === T.PUNCT && t.value === "[") {
      return this.parseLambda();
    }
    if (t.type === T.PUNCT && t.value === "{") {
      return this.parseBraceInit();
    }

    if (t.type === T.IDENT) {
      if (t.value === "true" || t.value === "false") {
        this.next();
        return { kind: "Literal", value: t.value === "true", pos: t.pos };
      }
      if (t.value === "nullptr") {
        this.next();
        return { kind: "Literal", value: null, pos: t.pos };
      }
      if (t.value === "this") {
        this.next();
        return { kind: "Identifier", name: "this", pos: t.pos };
      }
      if (CAST_KEYWORDS.has(t.value)) {
        this.next();
        const targs = this.tryParseTemplateArgs() || [];
        this.expect("(");
        const arg = this.parseExpression();
        this.expect(")");
        return { kind: "Cast", typeName: targs[0] || "auto", arg, pos: t.pos };
      }
      if (t.value === "new" || t.value === "delete" || t.value === "throw") {
        throw new ParseError(`'${t.value}' is not supported by this interpreter`, t);
      }

      const name = this.parseQualifiedName();
      const targs = this.tryParseTemplateArgs();
      return { kind: "Identifier", name, templateArgs: targs, pos: t.pos };
    }

    throw new ParseError(
      t.type === T.EOF ? "unexpected end of function" : `unexpected token '${t.value}'`,
      t
    );
  }

  /**
   * Speculatively parse `<A, B>` as template arguments.
   *
   * `a < b` and `f<double>(x)` are genuinely ambiguous without type information, so we
   * try to consume a well-formed argument list containing only type-ish tokens and
   * require it to be followed by '(' or '::'. Anything else rewinds and is treated as
   * a less-than comparison.
   */
  tryParseTemplateArgs() {
    if (!this.at("<")) return null;
    const save = this.i;
    this.next();
    const args = [];
    let depth = 0;
    let current = "";
    let guard = 0;

    for (;;) {
      guard += 1;
      if (guard > 200) { this.i = save; return null; }
      const t = this.peek();
      if (t.type === T.EOF) { this.i = save; return null; }

      if (t.type === T.PUNCT && t.value === "<") { depth += 1; current += "<"; this.next(); continue; }
      if (t.type === T.PUNCT && t.value === ">") {
        this.next();
        if (depth === 0) {
          if (current.trim()) args.push(current.trim());
          break;
        }
        depth -= 1;
        current += ">";
        continue;
      }
      if (t.type === T.PUNCT && t.value === ">>" && depth >= 1) {
        // `vector<vector<int>>` closes two levels at once.
        this.next();
        depth -= 1;
        if (depth === 0) {
          if (current.trim()) args.push(current.trim());
          break;
        }
        depth -= 1;
        continue;
      }
      if (t.type === T.PUNCT && t.value === "," && depth === 0) {
        args.push(current.trim());
        current = "";
        this.next();
        continue;
      }
      if (t.type === T.IDENT || t.type === T.NUM) { current += String(t.value) + " "; this.next(); continue; }
      if (t.type === T.PUNCT && (t.value === "::" || t.value === "*" || t.value === "&")) {
        current += t.value;
        this.next();
        continue;
      }
      // Anything else (operators, parens, strings) means this was a comparison.
      this.i = save;
      return null;
    }

    // A template argument list must be followed by a call or a qualified name.
    const after = this.peek();
    if (after.type === T.PUNCT && (after.value === "(" || after.value === "::")) return args;
    if (after.type === T.IDENT) return args; // e.g. `vector<double> v;`
    this.i = save;
    return null;
  }

  parseLambda() {
    const start = this.peek();
    this.expect("[");
    // Capture list is irrelevant: the interpreter closes over the defining scope by
    // reference regardless, which matches [&] and is harmless for [=] in this code.
    let depth = 0;
    while (!this.atType(T.EOF)) {
      if (this.at("[")) depth += 1;
      else if (this.at("]")) {
        if (depth === 0) break;
        depth -= 1;
      }
      this.next();
    }
    this.expect("]");

    const params = [];
    if (this.eat("(")) {
      if (!this.at(")")) {
        do {
          // Strip the parameter type; keep the name.
          while (
            this.atType(T.IDENT) &&
            (TYPE_KEYWORDS.has(this.peek().value) ||
              (this.peek(1).type === T.IDENT ||
                this.peek(1).value === "*" ||
                this.peek(1).value === "&" ||
                this.peek(1).value === "::"))
          ) {
            if (this.peek(1).value === "::") {
              this.parseQualifiedName();
              this.tryParseTemplateArgs();
            } else {
              this.next();
            }
            this.tryParseTemplateArgs();
          }
          while (this.at("*") || this.at("&")) this.next();
          if (this.atType(T.IDENT)) params.push(this.next().value);
          if (this.eat("=")) this.parseAssignment(); // default argument, ignored
        } while (this.eat(","));
      }
      this.expect(")");
    }

    // Trailing specifiers: mutable, noexcept, -> Type
    while (this.atType(T.IDENT) && (this.peek().value === "mutable" || this.peek().value === "noexcept")) {
      this.next();
    }
    if (this.eat("->")) {
      this.parseQualifiedName();
      this.tryParseTemplateArgs();
      while (this.at("*") || this.at("&")) this.next();
    }

    const body = this.parseBlock();
    return { kind: "Lambda", params, body, pos: start.pos };
  }
}

/**
 * Parse one function body.
 *
 * @param {string} bodySrc  the `{ ... }` text of the function
 * @param {number} base     offset of bodySrc within the original paste
 * @param {string[]} params parameter names, in order
 */
export function parseFunctionBody(bodySrc, base, params) {
  const tokens = tokenize(bodySrc, base);
  const parser = new Parser(tokens);
  const block = parser.parseBlock();
  if (!parser.atType(T.EOF)) {
    throw new ParseError("trailing tokens after function body", parser.peek());
  }
  return { kind: "Function", params, body: block, pos: base };
}

/** Parse a bare expression. Used by the self-check harness. */
export function parseExpressionSource(src) {
  const parser = new Parser(tokenize(src, 0));
  const expr = parser.parseExpression();
  return expr;
}

/** Parse a sequence of statements (no enclosing braces). Used by the self-check harness. */
export function parseStatements(src) {
  const parser = new Parser(tokenize(src, 0));
  const body = [];
  while (!parser.atType(T.EOF)) body.push(parser.parseStatement());
  return { kind: "Block", body, pos: 0 };
}

export { Parser };
