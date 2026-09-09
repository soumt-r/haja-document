import { StreamLanguage, type StreamParser } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

const hajaParser: StreamParser<unknown> = {
  token(stream) {
    if (stream.eatSpace()) return null;

    if (stream.match(/^\d+(?:\.\d+)?/)) return "number";
    if (stream.match(/^"(?:\\[\s\S]|[^"\\])*"/)) return "string";
    if (stream.match(/^틀"(?:\{[^{}]*\}|\\[\s\S]|[^"\\{])*"/)) return "string";
    if (stream.match(/^\[[가-힣a-zA-Z_][가-힣a-zA-Z0-9_]*\]/)) return "typeName";
    if (stream.match(/^<[^>]+>/)) return "propertyName";
    if (stream.match(/^'[가-힣a-zA-Z0-9_]+'/)) return "variableName";
    
    // Comments
    if (stream.match(/^\/\/.*/)) return "comment";
    if (stream.match(/^\((참고|주석|메모)\).*/)) return "comment";

    const keywordRegex = /^(일종이다|이어출력하자|입력받자|번째|바깥|부모|나|설계하자|규정하자|있어야 한다|처음 만들어질 때|다음과 같이 하자|바탕으로 하고|바탕으로|따르는|만들자|만들어 숨기자|만들어 물려주자|정하여 숨기자|정하여 물려주자|정하자|고정하자|준비하자|돌려주는|돌려주자|출력하자|실행하자|일단 해보자|오류가 발생했다면|마무리는 항상|발생시키자|만약|그렇지 않고 만약|그렇지 않다면|라면|에 따라 나누자|인 경우|나머지는|다음으로 이어가자|동안 반복하자|마다 반복하자|반복을 끝내자|부터|까지 반복하자|크다|작다|이상이다|이하이다|같다|다르다|그리고|또는|더하자|빼자|추가하자|가져오자|전부|값|길이)/;
    if (stream.match(keywordRegex)) return "keyword";

    const operatorRegex = /^[+\-*/=:,]/;
    if (stream.match(operatorRegex)) return "operator";

    const particles = /^(에서|으로|보다|만큼|을|를|로|은|는|이|가|에|의|와|과|인)/;
    if (stream.match(particles)) return "propertyName"; // highlighting particles differently

    const booleanNull = /^(참|거짓|비어있음)/;
    if (stream.match(booleanNull)) return "bool";

    if (stream.match(/^[(){}\[\]]/)) return "bracket";

    stream.next();
    return null;
  }
};

export const hajaLanguage = StreamLanguage.define(hajaParser);
