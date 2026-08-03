// Tokeniser for the C++ subset.
//
// Only ever runs on the function bodies extract.js has already pulled out of the paste,
// never on the whole file. Every token carries the offset into the ORIGINAL paste so a
// diagnostic can point at the real line of brain_tree.cpp.

export const T = {
  NUM: "num",
  STR: "str",
  CHAR: "char",
  IDENT: "ident",
  PUNCT: "punct",
  EOF: "eof",
};

// Longest-first, so '<<=' beats '<<' beats '<'.
const PUNCTUATORS = [
  "<<=", ">>=", "...", "->*",
  "==", "!=", "<=", ">=", "&&", "||", "++", "--", "->", "::", "+=", "-=", "*=", "/=", "%=",
  "&=", "|=", "^=", "<<", ">>", ".*",
  "+", "-", "*", "/", "%", "=", "<", ">", "!", "~", "&", "|", "^", "?", ":", ";", ",",
  ".", "(", ")", "[", "]", "{", "}", "#",
];

export const KEYWORDS = new Set([
  "if", "else", "for", "while", "do", "switch", "case", "default", "break", "continue",
  "return", "true", "false", "nullptr", "new", "delete", "sizeof", "static_cast",
  "const_cast", "dynamic_cast", "reinterpret_cast", "template", "typename", "class",
  "struct", "enum", "namespace", "using", "throw", "try", "catch",
]);

// Type/storage keywords. The interpreter is dynamically typed, so these are parsed as
// declaration decorators and then discarded -- except `static`, which selects a
// persistent storage slot, and `const`, which is recorded but not enforced.
export const TYPE_KEYWORDS = new Set([
  "void", "bool", "char", "short", "int", "long", "float", "double", "signed", "unsigned",
  "auto", "const", "constexpr", "static", "mutable", "volatile", "inline", "register",
  "string", "size_t", "uint8_t", "uint16_t", "uint32_t", "uint64_t",
  "int8_t", "int16_t", "int32_t", "int64_t",
]);

export class LexError extends Error {
  constructor(message, pos) {
    super(message);
    this.name = "LexError";
    this.pos = pos;
  }
}

/**
 * @param {string} src   the text to tokenise
 * @param {number} base  offset of `src` within the original paste (added to every token pos)
 */
export function tokenize(src, base = 0) {
  const tokens = [];
  let i = 0;
  const n = src.length;

  const push = (type, value, start) => {
    tokens.push({ type, value, pos: base + start, end: base + i });
  };

  while (i < n) {
    const ch = src[i];

    // Whitespace
    if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n") {
      i += 1;
      continue;
    }

    // Line comment
    if (ch === "/" && src[i + 1] === "/") {
      while (i < n && src[i] !== "\n") i += 1;
      continue;
    }
    // Block comment
    if (ch === "/" && src[i + 1] === "*") {
      const start = i;
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i += 1;
      if (i >= n) throw new LexError("unterminated block comment", base + start);
      i += 2;
      continue;
    }

    // Preprocessor directive: skip the whole logical line (handles \ continuations).
    if (ch === "#") {
      while (i < n) {
        if (src[i] === "\\") {
          i += 2;
          continue;
        }
        if (src[i] === "\n") break;
        i += 1;
      }
      continue;
    }

    // Number: 123, 1.5, .5, 1e-3, 0x1f, with C++ suffixes (f, u, l, LL...)
    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(src[i + 1] || ""))) {
      const start = i;
      if (ch === "0" && (src[i + 1] === "x" || src[i + 1] === "X")) {
        i += 2;
        while (i < n && /[0-9a-fA-F']/.test(src[i])) i += 1;
      } else {
        while (i < n && /[0-9']/.test(src[i])) i += 1;
        if (src[i] === ".") {
          i += 1;
          while (i < n && /[0-9']/.test(src[i])) i += 1;
        }
        if (src[i] === "e" || src[i] === "E") {
          const save = i;
          i += 1;
          if (src[i] === "+" || src[i] === "-") i += 1;
          if (/[0-9]/.test(src[i] || "")) {
            while (i < n && /[0-9]/.test(src[i])) i += 1;
          } else {
            i = save;
          }
        }
      }
      const text = src.slice(start, i).replace(/'/g, "");
      while (i < n && /[fFuUlL]/.test(src[i])) i += 1; // literal suffix
      push(T.NUM, Number(text), start);
      continue;
    }

    // String literal (with escapes). Adjacent literals are concatenated by the parser.
    if (ch === '"') {
      const start = i;
      i += 1;
      let out = "";
      while (i < n && src[i] !== '"') {
        if (src[i] === "\\") {
          out += unescapeChar(src[i + 1]);
          i += 2;
        } else {
          out += src[i];
          i += 1;
        }
      }
      if (i >= n) throw new LexError("unterminated string literal", base + start);
      i += 1;
      push(T.STR, out, start);
      continue;
    }

    // Char literal -> treated as a one-character string.
    if (ch === "'") {
      const start = i;
      i += 1;
      let out = "";
      while (i < n && src[i] !== "'") {
        if (src[i] === "\\") {
          out += unescapeChar(src[i + 1]);
          i += 2;
        } else {
          out += src[i];
          i += 1;
        }
      }
      if (i >= n) throw new LexError("unterminated character literal", base + start);
      i += 1;
      push(T.CHAR, out, start);
      continue;
    }

    // Identifier / keyword
    if (/[A-Za-z_]/.test(ch)) {
      const start = i;
      while (i < n && /[A-Za-z0-9_]/.test(src[i])) i += 1;
      push(T.IDENT, src.slice(start, i), start);
      continue;
    }

    // Punctuator
    let matched = null;
    for (const p of PUNCTUATORS) {
      if (src.startsWith(p, i)) {
        matched = p;
        break;
      }
    }
    if (matched) {
      const start = i;
      i += matched.length;
      push(T.PUNCT, matched, start);
      continue;
    }

    throw new LexError(`unexpected character ${JSON.stringify(ch)}`, base + i);
  }

  tokens.push({ type: T.EOF, value: null, pos: base + n, end: base + n });
  return tokens;
}

function unescapeChar(c) {
  switch (c) {
    case "n": return "\n";
    case "t": return "\t";
    case "r": return "\r";
    case "0": return "\0";
    case "\\": return "\\";
    case '"': return '"';
    case "'": return "'";
    default: return c === undefined ? "" : c;
  }
}

/** Map an offset in the original paste to { line, col } (both 1-based). */
export function posToLineCol(source, pos) {
  let line = 1;
  let lineStart = 0;
  const limit = Math.min(pos, source.length);
  for (let i = 0; i < limit; i += 1) {
    if (source[i] === "\n") {
      line += 1;
      lineStart = i + 1;
    }
  }
  return { line, col: limit - lineStart + 1 };
}
