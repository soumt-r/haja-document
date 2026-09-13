import { autocompletion } from "@codemirror/autocomplete";
import type { CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { linter } from "@codemirror/lint";
import type { Diagnostic } from "@codemirror/lint";
import { Lexer } from "./lexer";
import { Parser } from "./parser";

const keywords = [
  "이다", "아니다", "입력받자", "숨기자", "물려주자", "설계하자", "정하자", "고정하자",
  "만들자", "있어야 한다", "바탕으로", "따르는", "처음 만들어질 때", "돌려주는",
  "실행하자", "출력하자", "반복하자", "그리고", "또는", "에 따라 나누자", "발생했다면",
  "발생시키자", "일단 해보자", "마무리는 항상", "꺼내자", "추가하자", "크다", "작다",
  "다르다", "같다", "만약", "그렇지 않고", "그렇지 않다면", "참", "거짓", "비어있음",
  "나", "우리"
];

export function hajaCompletions(context: CompletionContext): CompletionResult | null {
  let word = context.matchBefore(/[\uAC00-\uD7A3a-zA-Z_]+/);
  let isVar = false;
  let isType = false;
  let isProp = false;

  const varMatch = context.matchBefore(/'[\uAC00-\uD7A3a-zA-Z_]*/);
  const typeMatch = context.matchBefore(/\[[\uAC00-\uD7A3a-zA-Z_]*/);
  const propMatch = context.matchBefore(/<[\uAC00-\uD7A3a-zA-Z_]*/);

  if (varMatch && (!word || varMatch.from < word.from)) { word = varMatch; isVar = true; }
  else if (typeMatch && (!word || typeMatch.from < word.from)) { word = typeMatch; isType = true; }
  else if (propMatch && (!word || propMatch.from < word.from)) { word = propMatch; isProp = true; }

  if (!word) return null;
  if (word.from === word.to && !context.explicit) return null;

  const doc = context.state.doc.toString();
  const options: any[] = [];
  const seen = new Set<string>();

  if (!isVar && !isType && !isProp) {
    for (const kw of keywords) {
      options.push({ label: kw, type: "keyword" });
    }
  }

  // To tolerate lexer errors (like unclosed quotes while typing),
  // we catch the error but still use whatever tokens were successfully parsed.
  let tokens: any[] = [];
  try {
    const lexer = new Lexer(doc);
    tokens = lexer.tokens;
  } catch (e: any) {
    // lexer might not expose tokens if it threw in constructor.
    // Let's do a fallback regex scan on the raw document!
  }

  // Fallback regex scan for robust autocompletion even with broken syntax
  const varRegex = /'([\uAC00-\uD7A3a-zA-Z0-9_]+)'/g;
  const typeRegex = /\[([\uAC00-\uD7A3a-zA-Z0-9_]+)\]/g;
  const propRegex = /<([\uAC00-\uD7A3a-zA-Z0-9_]+)>/g;
  
  let match;
  while ((match = varRegex.exec(doc)) !== null) {
    const val = "'" + match[1] + "'";
    if (!seen.has(val)) {
      seen.add(val);
      if (isVar || (!isType && !isProp)) options.push({ label: val, type: "variable" });
    }
  }
  while ((match = typeRegex.exec(doc)) !== null) {
    const val = "[" + match[1] + "]";
    if (!seen.has(val)) {
      seen.add(val);
      if (isType || (!isVar && !isProp)) options.push({ label: val, type: "class" });
    }
  }
  while ((match = propRegex.exec(doc)) !== null) {
    const val = "<" + match[1] + ">";
    if (!seen.has(val)) {
      seen.add(val);
      if (isProp || (!isVar && !isType)) options.push({ label: val, type: "method" });
    }
  }

  return {
    from: word.from,
    options: options
  };
}

export const hajaAutocomplete = autocompletion({ override: [hajaCompletions] });

export const hajaLinter = linter(view => {
  let diagnostics: Diagnostic[] = [];
  const doc = view.state.doc.toString();
  
  if (!doc.trim()) return [];

  try {
    const lexer = new Lexer(doc);
    const parser = new Parser(lexer.tokens);
    parser.parse_program();
  } catch (err: any) {
    const msg = String(err);
    const match = msg.match(/(\d+)번째 줄(?:,\s*(\d+)번째 글자)?/);
    if (match) {
      let line = parseInt(match[1]);
      if (line < 1) line = 1;
      if (line > view.state.doc.lines) line = view.state.doc.lines;
      
      const col = match[2] ? parseInt(match[2]) : 0;
      
      const lineInfo = view.state.doc.line(line);
      const from = Math.min(lineInfo.from + col, lineInfo.to);
      const to = lineInfo.to;
      
      diagnostics.push({
        from: from,
        to: Math.max(from + 1, to),
        severity: "error",
        message: msg
      });
    } else {
        diagnostics.push({
          from: 0,
          to: view.state.doc.line(1).to,
          severity: "error",
          message: msg
        });
    }
  }
  
  return diagnostics;
});
