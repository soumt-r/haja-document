import { StreamLanguage, type StreamParser } from "@codemirror/language";
import { lspKeywords } from "./lspKeywords";

// Verbs and words the lexer reads that lspKeywords (the editor's completion list,
// generated from hana/lsp) does not carry: multi-part verbs, comparisons, and the
// loop/class phrases. Everything in lspKeywords is highlighted too, so a keyword
// added to hana shows up colored here without touching this file.
const extraKeywords = [
  "이다", "아니다", "만들자", "바탕으로 하고", "가져올 때", "정할 때", "처음 만들어질 때",
  "를 위해 준비하자", "를 하면서", "를 하고", "무한히", "부터", "까지", "마자", "준비하자", "숨기자",
  "오류가 발생했다면", "무조건", "그만하자", "계속하자", "그렇지 않고 만약", "라면", "의 종류는", "이고", "일 때", "동안", "값",
  "마다 반복하자", "앞에서", "앞에", "뒤에서", "뒤에", "크거나 같다", "작거나 같다",
  "가져오자", "다음과 같이 하자", "다음으로 이어가자", "더하자", "빼자", "빼내자", "꺼낸", "부모", "바깥",
  "만들어 숨기자", "만들어 물려주자", "정하여 숨기자", "정하여 물려주자",
  "같지 않다", "와 같다", "과 같다", "보다 크다", "보다 작다", "이상이다", "이하이다", "이하다", "의 일종이다",
];

const valueWords = ["참", "거짓", "비어있음"];

function alternation(words: readonly string[]): RegExp {
  const unique = Array.from(new Set(words)).sort((a, b) => b.length - a.length);
  const escaped = unique.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp("^(?:" + escaped.join("|") + ")");
}

const keywordRegex = alternation([
  ...lspKeywords.keywords.filter((w) => !valueWords.includes(w)),
  ...lspKeywords.comparisons,
  ...lspKeywords.words,
  ...extraKeywords,
]);
const valueRegex = alternation(valueWords);

const isHangul = (ch: string | undefined) => ch !== undefined && /[가-힣]/.test(ch);

const hajaParser: StreamParser<unknown> = {
  token(stream) {
    if (stream.eatSpace()) return null;

    if (stream.match(/^\d+(?:\.\d+)?/)) return "number";
    if (stream.match(/^"(?:\\[\s\S]|[^"\\])*"/)) return "string";
    if (stream.match(/^틀"(?:\{[^{}]*\}|\\[\s\S]|[^"\\{])*"/)) return "string";
    if (stream.match(/^\[[^\]]+\]/)) return "typeName";
    if (stream.match(/^<[^>]+>/)) return "propertyName";
    if (stream.match(/^'[가-힣a-zA-Z0-9_]+'/)) return "variableName";

    // 주석: `(참고)` 뒤나 `(참고: ...)`부터 줄 끝까지 (렉서도 그렇게 자른다)
    if (stream.match(/^\/\/.*/)) return "comment";
    if (stream.match(/^\((참고|주석|메모)(?:\)|:).*/)) return "comment";

    const startsWord = !isHangul(stream.string[stream.pos - 1]);
    // 낱말은 한글 낱말의 한가운데에서 시작하면 안 된다 (예: '가져오자'의 '가'는 조사가 아니다).
    if (startsWord) {
      const value = stream.match(valueRegex, false) as RegExpMatchArray | null;
      if (value) {
        stream.pos += value[0].length;
        return "bool";
      }
      const keyword = stream.match(keywordRegex, false) as RegExpMatchArray | null;
      if (keyword && (keyword[0] !== "나" || !isHangul(stream.string[stream.pos + 1]))) {
        stream.pos += keyword[0].length;
        return "keyword";
      }
    }

    if (stream.match(/^[+\-*/%=!:,]/)) return "operator";

    // `[숫자]인 3`의 '인'은 타입 표시
    if (stream.string[stream.pos - 1] === "]" && stream.match(/^인/)) return "meta";
    // `"VIP" 인 경우:`, `(조건)인 동안`
    if (startsWord && stream.match(/^인(?=[\s:])/)) return "meta";

    if (stream.match(/^(에게|에서|으로|번째|은|는|이|가|을|를|와|과|로|의|에)/)) return "meta";

    if (stream.match(/^[(){}\[\]]/)) return "bracket";

    stream.next();
    return null;
  },
};

export const hajaLanguage = StreamLanguage.define(hajaParser);
