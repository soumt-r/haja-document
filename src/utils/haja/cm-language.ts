import { StreamLanguage, type StreamParser } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

const hajaParser: StreamParser<unknown> = {
  token(stream) {
    if (stream.eatSpace()) return null;

    if (stream.match(/^\d+(?:\.\d+)?/)) return "number";
    if (stream.match(/^"(?:\\[\s\S]|[^"\\])*"/)) return "string";
    if (stream.match(/^틀"(?:\{[^{}]*\}|\\[\s\S]|[^"\\{])*"/)) return "string";
    if (stream.match(/^\[[^\]]+\]/)) return "typeName";
    if (stream.match(/^<[^>]+>/)) return "propertyName";
    if (stream.match(/^'[가-힣a-zA-Z0-9_]+'/)) return "variableName";
    
    // Comments
    if (stream.match(/^\/\/.*/)) return "comment";
    if (stream.match(/^\((참고|주석|메모)\).*/)) return "comment";

    const keywordRegex = /^(이다|아니다|입력받자|출력하자|만들자|설계하자|밑설계하자|바탕으로|따르는|돌려주는|있어야 한다|가져올 때|정할 때|처음 만들어질 때|를 위해 준비하자|를 하면서|를 하고|무한히|반복하자|그만하자|계속하자|부터|까지|마자|준비하자|정하자|숨기자|고정하자|일단 해보자|오류가 발생했다면|발생했다면|무조건|발생시키자|만약|그렇지 않고 만약|그렇지 않다면|라면|의 종류는|이고|일 때|실행하자|마다 반복하자|반복을 끝내자|앞에|앞에서|뒤에|뒤에서|추가하자|꺼내자|크다|작다|크거나 같다|작거나 같다|같다|다르다|그리고|또는|우리)/;
    if (stream.match(keywordRegex)) return "keyword";

    const operatorRegex = /^[+\-*/%=!:,]/;
    if (stream.match(operatorRegex)) return "operator";

    const particles = /^(은|는|이|가|을|를|와|과|로|으로|의|에|에게|에서)/;
    if (stream.match(particles)) return "meta";

    const booleanNull = /^(참|거짓|비어있음)/;
    if (stream.match(booleanNull)) return "bool";

    if (stream.match(/^[(){}\[\]]/)) return "bracket";

    stream.next();
    return null;
  }
};

export const hajaLanguage = StreamLanguage.define(hajaParser);
