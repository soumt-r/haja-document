// Mirrors hana/lexer/haja/lexer.go: one ordered `{kind, regex}[]` spec table,
// first match wins, plus a Python-style indent/dedent stack. The Go lexer
// works line-by-line and drives everything off a single `tokenize` call; this
// port keeps that shape but wraps it in a `Lexer` class (constructor
// tokenizes eagerly, `.tokens` is the result) since hajaLSP.ts already
// depends on that exact shape (`new Lexer(doc).tokens`).
import * as tok from "./token";
import type { Token, TokenType } from "./token";
import { HajaError } from "./errors";

interface Spec {
  kind: TokenType | "SPACE";
  regex: RegExp;
}

const SPECS: Spec[] = [
  { kind: tok.STRING, regex: /^"(?:\\[\s\S]|[^"\\])*"/ },
  { kind: tok.VAR, regex: /^'[가-힣a-zA-Z0-9_]+'/ },
  { kind: tok.FUNCTION, regex: /^<[^>]+>/ },
  { kind: tok.TYPE, regex: /^\[(?:\([^)]+\))?[가-힣a-zA-Z_][가-힣a-zA-Z0-9_]*\]/ },
  { kind: tok.LBRACKET, regex: /^\[/ },
  { kind: tok.RBRACKET, regex: /^\]/ },
  { kind: tok.LPAREN, regex: /^\(/ },
  { kind: tok.RPAREN, regex: /^\)/ },
  { kind: tok.LBRACE, regex: /^\{/ },
  { kind: tok.RBRACE, regex: /^\}/ },
  { kind: tok.COMMA, regex: /^,/ },
  { kind: tok.COLON, regex: /^:/ },
  { kind: tok.KW_RETURN, regex: /^돌려주자/ },
  { kind: tok.KW_BREAK, regex: /^반복을 끝내자/ },
  { kind: tok.KW_LOOP, regex: /^반복하자/ },
  { kind: tok.KW_PUSH, regex: /^추가하자/ },
  { kind: tok.KW_POP, regex: /^빼내자|^꺼내자/ },
  { kind: tok.KW_POPPED, regex: /^꺼낸/ },
  { kind: tok.KW_TRY, regex: /^일단 해보자/ },
  { kind: tok.KW_CATCH, regex: /^발생했다면/ },
  { kind: tok.KW_FINALLY, regex: /^마무리는 항상/ },
  { kind: tok.KW_THROW, regex: /^던지자|^발생시키자/ },
  { kind: tok.KW_CLASS, regex: /^설계하자|^밑설계하자/ },
  { kind: tok.KW_INTERFACE, regex: /^규정하자/ },
  { kind: tok.KW_MUST_HAVE, regex: /^있어야 한다/ },
  { kind: tok.KW_IMPORT, regex: /^가져오자/ },
  { kind: tok.KW_FROM, regex: /^에서/ },
  { kind: tok.KW_IMPLEMENTS, regex: /^따르는/ },
  { kind: tok.KW_IF, regex: /^만약/ },
  { kind: tok.KW_ELSE, regex: /^그렇지 않다면|^그렇지 않고/ },
  { kind: tok.IDENT, regex: /^라면/ },
  {
    kind: tok.KW_MAKE,
    regex: /^만들어 숨기자|^만들어 물려주자|^만들자|^정하여 숨기자|^정하여 물려주자|^정하자|^숨기자|^고정하자|^준비하자/,
  },
  { kind: tok.KW_PRINT, regex: /^출력하자|^이어출력하자/ },
  { kind: tok.KW_INPUT, regex: /^입력받자/ },
  { kind: tok.KW_EXECUTE, regex: /^실행하자/ },
  { kind: tok.KW_NULL, regex: /^비어있음/ },
  { kind: tok.KW_TRUE, regex: /^참/ },
  { kind: tok.KW_FALSE, regex: /^거짓/ },
  { kind: tok.KW_CONSTRUCT, regex: /^처음 만들어질 때/ },
  { kind: tok.KW_DO_AS, regex: /^다음과 같이 하자/ },
  { kind: tok.KW_BASE, regex: /^바탕으로 하고|^바탕으로/ },
  { kind: tok.KW_GETTER, regex: /^가져올 때/ },
  { kind: tok.KW_SETTER, regex: /^정할 때/ },
  { kind: tok.KW_PARENT, regex: /^부모/ },
  { kind: tok.KW_OUTER, regex: /^바깥/ },
  { kind: tok.KW_NEW, regex: /^새로운/ },
  { kind: tok.KW_SWITCH, regex: /^따라 나누자/ },
  { kind: tok.KW_CASE, regex: /^경우/ },
  { kind: tok.KW_DEFAULT, regex: /^나머지는/ },
  { kind: tok.KW_FALLTHROUGH, regex: /^다음으로 이어가자/ },
  { kind: tok.KW_AND, regex: /^그리고/ },
  { kind: tok.KW_OR, regex: /^또는/ },
  { kind: tok.KW_SELF, regex: /^나/ },
  { kind: tok.KW_FRONT, regex: /^앞에(서)?/ },
  { kind: tok.KW_BACK, regex: /^뒤에(서)?/ },
  { kind: tok.KW_ADD, regex: /^더하자/ },
  { kind: tok.KW_SUB, regex: /^빼자/ },
  { kind: tok.TEMPLATE_STRING, regex: /^틀"(?:\{[^{}]*\}|\\[\s\S]|[^"\\{])*"/ },
  {
    kind: tok.COMPARE,
    regex: /^(==|!=|<=|>=|<|>|와\s*같다|과\s*같다|보다\s*크다|보다\s*작다|이상이다|이하이다|이하다|같지 않다|같다|다르다|크다|작다|의\s*일종이다|이다)/,
  },
  { kind: tok.ASSIGN, regex: /^=/ },
  { kind: tok.OP, regex: /^[+\-*/%]/ },
  { kind: tok.TYPE_IN, regex: /^인/ },
  {
    kind: tok.PARTICLE,
    regex: /^(를|을|가|이|는|은|의|와|과|로|으로|에|에서|보다|만큼|도|번째|부터|까지|마다|앞에서|뒤에서|앞에|뒤에)/,
  },
  { kind: tok.INT, regex: /^\d+(?:\.\d+)?/ },
  { kind: tok.IDENT, regex: /^[가-힣a-zA-Z_][가-힣a-zA-Z0-9_]*/ },
  { kind: "SPACE", regex: /^[ \t]+/ },
];

export class Lexer {
  tokens: Token[] = [];

  constructor(input: string) {
    this.tokenize(input);
  }

  private tokenize(input: string): void {
    const lines = input.split(/\r?\n/);
    const indents = [0];
    let lineNum = 1;

    for (let rawLine of lines) {
      // 인라인 주석 제거
      const refIdx = rawLine.indexOf("(참고)");
      if (refIdx !== -1) rawLine = rawLine.slice(0, refIdx);
      const refColonIdx = rawLine.indexOf("(참고:");
      if (refColonIdx !== -1) rawLine = rawLine.slice(0, refColonIdx);

      if (rawLine.trim() === "") {
        lineNum++;
        continue;
      }

      const indentMatch = /^[ \t]*/.exec(rawLine)?.[0] ?? "";
      const currentIndent = indentMatch.length;

      if (currentIndent > indents[indents.length - 1]) {
        indents.push(currentIndent);
        this.tokens.push({ type: tok.INDENT, literal: "", line: lineNum });
      } else if (currentIndent < indents[indents.length - 1]) {
        while (currentIndent < indents[indents.length - 1]) {
          indents.pop();
          this.tokens.push({ type: tok.DEDENT, literal: "", line: lineNum });
        }
      }

      let remaining = rawLine.trim();

      while (remaining.length > 0) {
        let matched = false;
        for (const spec of SPECS) {
          const m = spec.regex.exec(remaining);
          if (m && m.index === 0) {
            const val = m[0];
            if (spec.kind !== "SPACE") {
              this.tokens.push({ type: spec.kind, literal: val, line: lineNum });
            }
            remaining = remaining.slice(val.length);
            matched = true;
            break;
          }
        }
        if (!matched) {
          // MISMATCH: 알 수 없는 한 글자 — 예전 TS 엔진은 이 지점에서 HajaError를
          // 던졌다(Go는 그냥 한 글자를 건너뛴다). Playground에는 "왜 멈췄는지"가
          // Go의 침묵보다 사용자에게 더 유용해서 이 동작을 유지한다.
          throw new HajaError(`알 수 없는 문자예요: '${remaining[0]}'`, lineNum);
        }
      }
      lineNum++;
    }

    while (indents.length > 1) {
      indents.pop();
      this.tokens.push({ type: tok.DEDENT, literal: "", line: lineNum });
    }
    this.tokens.push({ type: tok.EOF, literal: "", line: lineNum });
  }
}
