import { HajaError, type Token } from './types';

export class Lexer {
  code: string;
  tokens: Token[];

  constructor(code: string) {
    this.code = code;
    this.tokens = [];
    this.tokenize();
  }

  tokenize() {
    const token_specification: [string, RegExp][] = [

      ['NUMBER',       /^\d+(?:\.\d+)?/],
      ['FORMAT_STR',   /^틀"(?:\{[^{}]*\}|\\[\s\S]|[^"\\{])*"/],
      ['STRING',       /^"(?:\\[\s\S]|[^"\\])*"/],
      ['TYPE',         /^\[[가-힣a-zA-Z_][가-힣a-zA-Z0-9_]*\]/],
      ['EMPTY_LIST',   /^\[\]/],
      ['LBRACKET',     /^\[/],
      ['RBRACKET',     /^\]/],
      ['EMPTY_DICT',   /^\{\}/],
      ['LBRACE',       /^\{/],
      ['RBRACE',       /^\}/],
      ['FUNCTION',     /^<[^>]+>/],
      ['NULL',         /^비어있음/],
      ['BOOLEAN',      /^참|^거짓/],
      
      ['KW_CLASS',     /^설계하자/],
      ['KW_INTERFACE', /^규정하자/],
      ['KW_REQUIRE',   /^있어야 한다/],
      ['KW_CONSTRUCT', /^처음 만들어질 때/],
      ['KW_DO_AS',     /^다음과 같이 하자/],
      ['KW_BASE',      /^바탕으로 하고|^바탕으로/],
      ['KW_IMPLEMENTS',/^따르는/],
      
      ['KW_FUNC',      /^만들자|^만들어 숨기자|^만들어 물려주자/],
      ['KW_ASSIGN',    /^정하여 숨기자|^정하여 물려주자|^정하자|^고정하자/],
      ['KW_DECLARE',   /^준비하자/],
      ['KW_RETURN_TYPE',/^돌려주는/],
      ['KW_RETURN',    /^돌려주자/],
      ['KW_PRINT_INLINE', /^이어출력하자/],
      ['KW_PRINT',     /^출력하자/],
      ['KW_INPUT',     /^입력받자/],
      ['KW_EXECUTE',   /^실행하자/],
      
      ['KW_TRY',       /^일단 해보자/],
      ['KW_CATCH',     /^오류가 발생했다면/],
      ['KW_FINALLY',   /^마무리는 항상/],
      ['KW_THROW',     /^발생시키자/],
      
      ['KW_IF',        /^만약/],
      ['KW_ELIF',      /^그렇지 않고 만약/],
      ['KW_ELSE',      /^그렇지 않다면/],
      ['KW_THEN',      /^라면/],
      
      ['KW_SWITCH',    /^에 따라 나누자/],
      ['KW_CASE',      /^인 경우/],
      ['KW_DEFAULT',   /^나머지는/],
      ['KW_FALLTHROUGH', /^다음으로 이어가자/],
      
      ['KW_WHILE',     /^동안 반복하자/],
      ['KW_FOREACH',   /^마다 반복하자/],
      ['KW_FROM',      /^부터/],
      ['KW_TO',        /^까지 반복하자/],
      ['KW_BREAK',     /^반복을 끝내자/],
      
      ['KW_IMPORT',    /^가져오자/],
      ['KW_ALL',       /^전부/],
      
      ['KW_VALUE',     /^값/],
      ['KW_INDEX',     /^번째(\s*값)?/],
      ['KW_LENGTH',    /^길이/],
      ['KW_PARENT',    /^부모/],
      ['KW_OUTER',     /^바깥/],
      ['KW_SELF',      /^나/],
      
      ['LOGIC',        /^(그리고|또는)/],
      ['COMPARE',      /^(와\s*같다|과\s*같다|보다\s*크다|보다\s*작다|이상이다|이하이다|의\s*일종이다|같다|다르다)/],
      ['PARTICLE',     /^(에서|으로|보다|만큼|을|를|로|은|는|이|가|에|의|와|과|도)/],
      ['KW_ADD',       /^더하자/],
      ['KW_SUB',       /^빼자/],
      ['KW_APPEND',    /^추가하자/],
      
      ['OP',           /^[+\-*/]/],
      
      ['TYPE_IN',      /^인/],
      ['COLON',        /^:/],
      ['NEWLINE',      /^\n/],
      ['ASSIGN_OP',    /^=/],
      ['VARIABLE',     /^'[가-힣a-zA-Z0-9_]+'/],
      ['KW_ALL',       /^전부/],
      ['LPAREN',       /^\(/],
      ['RPAREN',       /^\)/],
      ['COMMA',        /^,/],
      
      ['SPACE',        /^[ \t]+/],
      ['MISMATCH',     /^./],
    ];

    const indents = [0];
    const lines = this.code.split('\n');
    let line_num = 1;

    for (let line of lines) {
      if (!line.trim() || line.trim().match(/^\((참고|주석|메모)\)/)) {
        line_num += 1;
        continue;
      }
      
      line = line.replace(/\s*\((참고|주석|메모).*$/, '');

      const indent_match = line.match(/^[ \t]*/);
      const current_indent = indent_match ? indent_match[0].length : 0;

      if (current_indent > indents[indents.length - 1]) {
        indents.push(current_indent);
        this.tokens.push({ type: 'INDENT', value: '', line: line_num, col: 0 });
      } else if (current_indent < indents[indents.length - 1]) {
        while (current_indent < indents[indents.length - 1]) {
          indents.pop();
          this.tokens.push({ type: 'DEDENT', value: '', line: line_num, col: 0 });
        }
      }

      let remaining = line;
      let col = 0;
      while (remaining.length > 0) {
        let matched = false;
        for (const [kind, regex] of token_specification) {
          const match = remaining.match(regex);
          if (match) {
            const value = match[0];
            if (kind !== 'SPACE') {
              if (kind === 'MISMATCH') {
                throw new HajaError(`SyntaxError: 알 수 없는 기호 '${value}'를 발견했어요.`, line_num, col, value.length);
              }
              this.tokens.push({ type: kind, value: value.trim(), line: line_num, col: col });
            }
            remaining = remaining.substring(value.length);
            col += value.length;
            matched = true;
            break;
          }
        }
        if (!matched) {
          throw new HajaError("SyntaxError: 코드를 읽는 중에 알 수 없는 에러가 발생했어요.", line_num, col);
        }
      }
      line_num += 1;
    }

    while (indents.length > 1) {
      indents.pop();
      this.tokens.push({ type: 'DEDENT', value: '', line: line_num, col: 0 });
    }
  }
}
