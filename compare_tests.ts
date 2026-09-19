import { readdirSync, readFileSync, statSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { Lexer } from './src/utils/haja/lexer.ts';
import { Parser } from './src/utils/haja/parser.ts';
import { HajaInterpreter as Interpreter } from './src/utils/haja/interpreter.ts';
import { registerStandardLibrary } from './src/utils/haja/stdlib.ts';
import { KoreanConfig } from './src/utils/haja/config.ts';
import { localize, syntaxError } from './src/utils/haja/errs.ts';

const DOCS_DIR = './src/pages/docs';

// 난수와 현재 시각을 쓰는 예제는 실행마다 결과가 달라서, 에러 없이 끝나는지만 본다.
const NONDETERMINISTIC = /\[무작위\]|<지금>/;
const GO_EXECUTABLE = '..\\hana\\hana.exe';

function extractHajaBlocks(markdown: string): string[] {
    const blocks: string[] = [];
    const regex = /```haja([^\n]*)\n([\s\S]*?)```/g;
    let match;
    while ((match = regex.exec(markdown)) !== null) {
        blocks.push(match[2]);
    }
    return blocks;
}

// 에러도 비교한다: 실행이 에러로 끝나면 그 문구(현지화된 최종 메시지)를 출력 뒤에
// 붙여서, TS 엔진이 Go 엔진과 같은 문구를 내는지 잡아낸다. Go 쪽은 stderr의
// "런타임 오류: <메시지>" 줄에서 같은 메시지를 뽑는다.
async function runTypeScriptEngine(code: string, stdin = ''): Promise<string> {
    let output = "";
    let error = "";
    try {
        const lexer = new Lexer(code);
        const parser = new Parser(lexer.tokens);
        const ast = parser.parseProgram();
        const lines = stdin === '' ? [] : stdin.replace(/\n$/, '').split('\n');
        const interpreter = new Interpreter(ast, async () => lines.shift() ?? "");
        registerStandardLibrary(interpreter);

        interpreter.outputCallback = (msg) => {
            output += msg;
        };
        await interpreter.run();
    } catch (e: any) {
        error = String(e?.message ?? e);
    }
    return withError(output.trim(), error);
}

function withError(output: string, error: string): string {
    return error ? `${output}\n!! ${error}` : output;
}

function runGoEngine(code: string, stdin = ''): string {
    const tempFile = 'temp_test.hj';
    writeFileSync(tempFile, code);

    try {
        const result = execSync(`${GO_EXECUTABLE} run ${tempFile}`, { input: stdin, stdio: ['pipe', 'pipe', 'pipe'] });
        unlinkSync(tempFile);
        return result.toString().trim();
    } catch (e: any) {
        unlinkSync(tempFile);
        const stdout = e.stdout ? e.stdout.toString().trim() : "";
        const stderr = e.stderr ? e.stderr.toString() : "";
        const m = stderr.match(/^런타임 오류: (.*)$/m);
        return withError(stdout, m ? m[1].trim() : "");
    }
}

async function walk(dir: string, callback: (path: string) => Promise<void>) {
    const files = readdirSync(dir);
    for (const file of files) {
        const path = join(dir, file);
        if (statSync(path).isDirectory()) {
            await walk(path, callback);
        } else if (path.endsWith('.md') || path.endsWith('.mdx')) {
            await callback(path);
        }
    }
}

// 문서 예제에는 없지만 두 엔진이 같아야 하는 동작: 표준 라이브러리(std) 임포트.
const EXTRA_CASES: { name: string; code: string; stdin?: string }[] = [
    { name: "std 임포트", code: "[수학]에서 <올림>을 가져오자\n틀\"{<올림>(3.2)}\"를 출력하자" },
    { name: "std 임포트 (별칭)", code: "[수학]에서 <버림>을 <바닥>으로 가져오자\n틀\"{<바닥>(3.9)}\"를 출력하자" },
    { name: "없는 모듈", code: "[없는모듈]에서 <함수>를 가져오자" },
    { name: "없는 함수", code: "[수학]에서 <없는함수>를 가져오자" },
    { name: "끝없는 재귀", code: "<f>를 만들자 ():\n    <f>()를 실행하자\n<f>()를 실행하자" },
    { name: "입력 (문자열)", code: "'이름'을 입력받자\n'이름'을 출력하자", stdin: "홍길동\n" },
    { name: "입력 (숫자, 공백 허용)", code: "'나이'를 [숫자]로 입력받자\n틀\"{'나이' + 1}\"를 출력하자", stdin: " 20 \n" },
    { name: "입력 (논리)", code: "'참인가'를 [논리]로 입력받자\n'참인가'를 출력하자", stdin: "참\n" },
    { name: "입력 (숫자 실패)", code: "'나이'를 [숫자]로 입력받자\n'나이'를 출력하자", stdin: "스물\n" },
    { name: "입력 (빈 입력은 숫자가 아님)", code: "'나이'를 [숫자]로 입력받자\n'나이'를 출력하자", stdin: "" },
    { name: "타입: 선언 불일치", code: "'a'를 [숫자]인 \"문자\"로 정하자" },
    { name: "타입: 재대입 불일치", code: "'a'를 [숫자]인 3으로 정하자\n'a'를 \"x\"로 정하자" },
    { name: "타입: 비어있음 허용", code: "'a'를 [숫자]인 3으로 정하자\n'a'를 비어있음으로 정하자\n'a'를 출력하자" },
    { name: "타입: 제네릭 push", code: "'목록'을 [(숫자)목록]인 [1, 2]로 정하자\n'목록' 뒤에 \"셋\"을 추가하자" },
    { name: "타입: 제네릭 사전", code: "'점수'를 [(문자열, 숫자)사전]인 {\"국어\": \"구십\"}으로 정하자" },
    { name: "타입: 매개변수", code: "<두배>를 만들자 ([숫자]인 '값'):\n    ('값' * 2)를 출력하자\n<두배>(\"문자\")를 실행하자" },
    { name: "타입: 업캐스팅", code: "[동물]을 설계하자:\n    '이름'을 [문자열]인 \"동물\"으로 정하자\n[동물]을 바탕으로 [강아지]를 설계하자:\n    '재주'를 [문자열]인 \"앉아\"로 정하자\n[고양이]를 설계하자:\n    '이름'을 [문자열]인 \"나비\"로 정하자\n'친구'를 [동물]인 새로운 [강아지]()로 정하자\n'친구'의 '재주'를 출력하자" },
    { name: "타입: 낯선 클래스", code: "[동물]을 설계하자:\n    '이름'을 [문자열]인 \"동물\"으로 정하자\n[동물]을 바탕으로 [강아지]를 설계하자:\n    '재주'를 [문자열]인 \"앉아\"로 정하자\n[고양이]를 설계하자:\n    '이름'을 [문자열]인 \"나비\"로 정하자\n'친구'를 [동물]인 새로운 [고양이]()로 정하자" },
    { name: "타입: 필드 쓰기", code: "[사람]을 설계하자:\n    '나이'를 [숫자]인 20으로 정하자\n'홍길동'을 [사람]인 새로운 [사람]()로 정하자\n'홍길동'의 '나이'를 \"스물\"로 정하자" },
    { name: "연산: 숫자 + 문자열", code: "(10 + \"안녕\")를 출력하자" },
    { name: "연산: 문자열 - 문자열", code: "(\"a\" - \"b\")를 출력하자" },
    { name: "연산: 문자열 + 문자열", code: "(\"가\" + \"나\")를 출력하자" },
    { name: "연산: 비어있음 피연산자", code: "(1 + 비어있음)을 출력하자" },
    { name: "연산: 비어있음 동등 비교", code: "(비어있음 == 비어있음)을 출력하자" },
    { name: "연산: 복합 대입", code: "'a'를 \"x\"로 정하자\n'a'에 3을 더하자" },
    { name: "추상: 인터페이스 생성", code: "[날수있는것]을 규정하자:\n    <날기>가 있어야 한다 ()\n새로운 [날수있는것]()을 실행하자\n\"만들어짐\"을 출력하자" },
    { name: "추상: 추상 클래스 생성", code: "[도형]을 밑설계하자:\n    <넓이>를 만들자 ():\n        1을 출력하자\n새로운 [도형]()을 실행하자\n\"만들어짐\"을 출력하자" },
    { name: "추상: 자식 클래스는 생성 가능", code: "[도형]을 밑설계하자:\n    <넓이>가 있어야 한다 ()\n[도형]을 바탕으로 [네모]를 설계하자:\n    [숫자]를 돌려주는 <넓이>를 만들자 ():\n        6을 돌려주자\n'모양'을 [도형]인 새로운 [네모]()로 정하자\n('모양'의 <넓이>())를 출력하자" },
    { name: "불변: 문자열 글자 재대입", code: "'이름'을 \"홍길동\"으로 정하자\n'이름'의 1번째를 \"김\"으로 정하자\n'이름'을 출력하자" },
    { name: "표준: JSON 파싱", code: "[JSON]에서 <파싱>을 가져오자\n[JSON]에서 <문자열화>를 가져오자\n'값'을 <파싱>(\"{\\\"a\\\": [1, {\\\"b\\\": true}], \\\"c\\\": null}\")로 정하자\n'값'을 출력하자" },
    { name: "표준: JSON 문자열화 키 정렬", code: "[JSON]에서 <파싱>을 가져오자\n[JSON]에서 <문자열화>를 가져오자\n<문자열화>({\"b\": 1, \"a\": [참, 비어있음, \"x\"]})를 출력하자" },
    { name: "표준: JSON 들여쓰기", code: "[JSON]에서 <파싱>을 가져오자\n[JSON]에서 <문자열화>를 가져오자\n<문자열화>({\"a\": [1, 2], \"b\": {}}, 2)를 출력하자" },
    { name: "표준: JSON 숫자 형식", code: "[JSON]에서 <파싱>을 가져오자\n[JSON]에서 <문자열화>를 가져오자\n<문자열화>([0.5, 100, 2.25, 0.0000001, 1000000000000000000000])를 출력하자" },
    { name: "표준: JSON 왕복", code: "[JSON]에서 <파싱>을 가져오자\n[JSON]에서 <문자열화>를 가져오자\n<파싱>(<문자열화>({\"이름\": \"하나\", \"줄\": \"a\\nb\"}))를 출력하자" },
    { name: "표준: JSON 잘못된 입력", code: "[JSON]에서 <파싱>을 가져오자\n[JSON]에서 <문자열화>를 가져오자\n<파싱>(\"{\")를 출력하자" },
    { name: "표준: JSON 문자열 아닌 키", code: "[JSON]에서 <파싱>을 가져오자\n[JSON]에서 <문자열화>를 가져오자\n<문자열화>({1: 2})를 출력하자" },
    { name: "표준: JSON 범위 밖 숫자", code: "[JSON]에서 <파싱>을 가져오자\n[JSON]에서 <문자열화>를 가져오자\n<파싱>(\"1e999\")를 출력하자" },
    { name: "표준: 무작위 정수 범위", code: "[무작위]에서 <실수>를 가져오자\n[무작위]에서 <정수>를 가져오자\n[무작위]에서 <고르기>를 가져오자\n[무작위]에서 <섞기>를 가져오자\n'값'을 <정수>(3, 5)로 정하자\n(('값' >= 3) 그리고 ('값' <= 5))를 출력하자" },
    { name: "표준: 무작위 정수 뒤집힘", code: "[무작위]에서 <실수>를 가져오자\n[무작위]에서 <정수>를 가져오자\n[무작위]에서 <고르기>를 가져오자\n[무작위]에서 <섞기>를 가져오자\n<정수>(3, 1)을 출력하자" },
    { name: "표준: 무작위 정수 소수", code: "[무작위]에서 <실수>를 가져오자\n[무작위]에서 <정수>를 가져오자\n[무작위]에서 <고르기>를 가져오자\n[무작위]에서 <섞기>를 가져오자\n<정수>(1.5, 3)을 출력하자" },
    { name: "표준: 무작위 빈 목록", code: "[무작위]에서 <실수>를 가져오자\n[무작위]에서 <정수>를 가져오자\n[무작위]에서 <고르기>를 가져오자\n[무작위]에서 <섞기>를 가져오자\n'빈'을 [(아무거나)목록]인 []로 정하자\n<고르기>('빈')을 출력하자" },
    { name: "표준: 무작위 섞기 길이", code: "[무작위]에서 <실수>를 가져오자\n[무작위]에서 <정수>를 가져오자\n[무작위]에서 <고르기>를 가져오자\n[무작위]에서 <섞기>를 가져오자\n'원본'을 [1, 2, 3, 4]로 정하자\n'섞음'을 <섞기>('원본')으로 정하자\n'섞음'의 '길이'를 출력하자\n'원본'을 출력하자" },
    { name: "표준: 날짜 왕복", code: "[날짜]에서 <서식>을 가져오자\n[날짜]에서 <읽기>를 가져오자\n<서식>(<읽기>(\"2024-03-05 07:08:09\", \"YYYY-MM-DD HH:mm:ss\"), \"YYYY/MM/DD HH:mm:ss\")를 출력하자" },
    { name: "표준: 날짜 서식 글자", code: "[날짜]에서 <서식>을 가져오자\n[날짜]에서 <읽기>를 가져오자\n<서식>(<읽기>(\"2024-03-05\", \"YYYY-MM-DD\"), \"YYYY년 MM월 DD일\")을 출력하자" },
    { name: "표준: 날짜 없는 날", code: "[날짜]에서 <서식>을 가져오자\n[날짜]에서 <읽기>를 가져오자\n<읽기>(\"2024-02-30\", \"YYYY-MM-DD\")를 출력하자" },
    { name: "표준: 날짜 서식 불일치", code: "[날짜]에서 <서식>을 가져오자\n[날짜]에서 <읽기>를 가져오자\n<읽기>(\"2024/03/05\", \"YYYY-MM-DD\")를 출력하자" },
    { name: "표준: 날짜 부호", code: "[날짜]에서 <서식>을 가져오자\n[날짜]에서 <읽기>를 가져오자\n<읽기>(\"2024-+3-05\", \"YYYY-MM-DD\")를 출력하자" },
    { name: "표준: 정규식 한글", code: "[정규식]에서 <검사>를 가져오자\n[정규식]에서 <찾기>를 가져오자\n[정규식]에서 <그룹>을 가져오자\n[정규식]에서 <모두찾기>를 가져오자\n[정규식]에서 <치환>을 가져오자\n[정규식]에서 <분할>을 가져오자\n<찾기>(\"abc한글def\", \"[가-힣]+\")을 출력하자" },
    { name: "표준: 정규식 없음", code: "[정규식]에서 <검사>를 가져오자\n[정규식]에서 <찾기>를 가져오자\n[정규식]에서 <그룹>을 가져오자\n[정규식]에서 <모두찾기>를 가져오자\n[정규식]에서 <치환>을 가져오자\n[정규식]에서 <분할>을 가져오자\n<찾기>(\"abc\", \"[0-9]+\")를 출력하자" },
    { name: "표준: 정규식 그룹", code: "[정규식]에서 <검사>를 가져오자\n[정규식]에서 <찾기>를 가져오자\n[정규식]에서 <그룹>을 가져오자\n[정규식]에서 <모두찾기>를 가져오자\n[정규식]에서 <치환>을 가져오자\n[정규식]에서 <분할>을 가져오자\n<그룹>(\"b\", \"(a)|(b)\")을 출력하자" },
    { name: "표준: 정규식 치환 그룹", code: "[정규식]에서 <검사>를 가져오자\n[정규식]에서 <찾기>를 가져오자\n[정규식]에서 <그룹>을 가져오자\n[정규식]에서 <모두찾기>를 가져오자\n[정규식]에서 <치환>을 가져오자\n[정규식]에서 <분할>을 가져오자\n<치환>(\"홍길동 김철수\", \"([^ ]+) ([^ ]+)\", \"$2 $1\")을 출력하자" },
    { name: "표준: 정규식 치환 달러", code: "[정규식]에서 <검사>를 가져오자\n[정규식]에서 <찾기>를 가져오자\n[정규식]에서 <그룹>을 가져오자\n[정규식]에서 <모두찾기>를 가져오자\n[정규식]에서 <치환>을 가져오자\n[정규식]에서 <분할>을 가져오자\n<치환>(\"a1\", \"[0-9]\", \"$x$$\")를 출력하자" },
    { name: "표준: 정규식 없는 그룹", code: "[정규식]에서 <검사>를 가져오자\n[정규식]에서 <찾기>를 가져오자\n[정규식]에서 <그룹>을 가져오자\n[정규식]에서 <모두찾기>를 가져오자\n[정규식]에서 <치환>을 가져오자\n[정규식]에서 <분할>을 가져오자\n<치환>(\"a1\", \"[0-9]\", \"<$3>\")을 출력하자" },
    { name: "표준: 정규식 분할", code: "[정규식]에서 <검사>를 가져오자\n[정규식]에서 <찾기>를 가져오자\n[정규식]에서 <그룹>을 가져오자\n[정규식]에서 <모두찾기>를 가져오자\n[정규식]에서 <치환>을 가져오자\n[정규식]에서 <분할>을 가져오자\n<분할>(\"a, b,c\", \", ?\")을 출력하자" },
    { name: "표준: 정규식 분할 캡처", code: "[정규식]에서 <검사>를 가져오자\n[정규식]에서 <찾기>를 가져오자\n[정규식]에서 <그룹>을 가져오자\n[정규식]에서 <모두찾기>를 가져오자\n[정규식]에서 <치환>을 가져오자\n[정규식]에서 <분할>을 가져오자\n<분할>(\"a1b2c\", \"([0-9])\")를 출력하자" },
    { name: "표준: 정규식 모두 없음", code: "[정규식]에서 <검사>를 가져오자\n[정규식]에서 <찾기>를 가져오자\n[정규식]에서 <그룹>을 가져오자\n[정규식]에서 <모두찾기>를 가져오자\n[정규식]에서 <치환>을 가져오자\n[정규식]에서 <분할>을 가져오자\n<모두찾기>(\"abc\", \"[0-9]\")를 출력하자" },
    { name: "표준: 정규식 모두찾기", code: "[정규식]에서 <검사>를 가져오자\n[정규식]에서 <찾기>를 가져오자\n[정규식]에서 <그룹>을 가져오자\n[정규식]에서 <모두찾기>를 가져오자\n[정규식]에서 <치환>을 가져오자\n[정규식]에서 <분할>을 가져오자\n<모두찾기>(\"a1b22c333\", \"[0-9]+\")를 출력하자" },
    { name: "표준: 정규식 잘못된 패턴", code: "[정규식]에서 <검사>를 가져오자\n[정규식]에서 <찾기>를 가져오자\n[정규식]에서 <그룹>을 가져오자\n[정규식]에서 <모두찾기>를 가져오자\n[정규식]에서 <치환>을 가져오자\n[정규식]에서 <분할>을 가져오자\n<검사>(\"a\", \"(\")를 출력하자" },
    { name: "표준: 정규식 대소문자 플래그", code: "[정규식]에서 <검사>를 가져오자\n[정규식]에서 <찾기>를 가져오자\n[정규식]에서 <그룹>을 가져오자\n[정규식]에서 <모두찾기>를 가져오자\n[정규식]에서 <치환>을 가져오자\n[정규식]에서 <분할>을 가져오자\n<검사>(\"ABC\", \"(?i)abc\")를 출력하자" },
    { name: "표준: 정규식 인자 종류", code: "[정규식]에서 <검사>를 가져오자\n[정규식]에서 <찾기>를 가져오자\n[정규식]에서 <그룹>을 가져오자\n[정규식]에서 <모두찾기>를 가져오자\n[정규식]에서 <치환>을 가져오자\n[정규식]에서 <분할>을 가져오자\n<검사>(1, \"a\")를 출력하자" },
];

// 구문 오류 문구: TS 엔진의 진단을 현지화한 문장이 hana가 보여 주는 문장과 같아야 한다.
const SYNTAX_CASES: string[] = ["\"a\"를 출력하자 )", "\"a\"를 출력하자 @", "1 +"];

function goSyntaxMessages(code: string): string[] {
    const tempFile = 'temp_syntax.hj';
    writeFileSync(tempFile, code);
    let stdout = '';
    try {
        stdout = execSync(`${GO_EXECUTABLE} run ${tempFile}`, { stdio: ['pipe', 'pipe', 'pipe'] }).toString();
    } catch (e: any) {
        stdout = e.stdout ? e.stdout.toString() : '';
    }
    unlinkSync(tempFile);
    return stdout.split(/\r?\n/).filter((l) => l.startsWith('  - ')).map((l) => l.slice(4));
}

function tsSyntaxMessages(code: string): string[] {
    const parser = new Parser(new Lexer(code).tokens);
    parser.parseProgram();
    return parser.diagnostics.map((d) => localize(KoreanConfig.locale, syntaxError(d)));
}

async function main() {
    console.log("🔍 TypeScript 엔진 vs Go 엔진 출력 비교를 시작합니다...\n");

    let total = 0;
    let passed = 0;

    await walk(DOCS_DIR, async (path) => {
        const content = readFileSync(path, 'utf8');
        const blocks = extractHajaBlocks(content);
        
        for (let i = 0; i < blocks.length; i++) {
            total++;
            const code = blocks[i];
            
            const tsOutput = await runTypeScriptEngine(code);
            const goOutput = runGoEngine(code);
            
            if (tsOutput === goOutput || (NONDETERMINISTIC.test(code) && !tsOutput.includes('!! ') && !goOutput.includes('오류') && !goOutput.includes('エラー'))) {
                passed++;
            } else {
                console.log(`❌ [불일치] 파일: ${path} (블록 ${i + 1})`);
                console.log(`-- 코드 --\n${code.trim()}`);
                console.log(`-- TS 출력 --\n${tsOutput}`);
                console.log(`-- Go 출력 --\n${goOutput}\n`);
            }
        }
    });

    for (const c of EXTRA_CASES) {
        total++;
        const tsOutput = await runTypeScriptEngine(c.code, c.stdin);
        const goOutput = runGoEngine(c.code, c.stdin);
        if (tsOutput === goOutput) {
            passed++;
        } else {
            console.log(`❌ [불일치] 추가 케이스: ${c.name}`);
            console.log(`-- 코드 --
${c.code}`);
            console.log(`-- TS 출력 --
${tsOutput}`);
            console.log(`-- Go 출력 --
${goOutput}
`);
        }
    }

    for (const code of SYNTAX_CASES) {
        total++;
        const ts = tsSyntaxMessages(code).join('\n');
        const go = goSyntaxMessages(code).join('\n');
        if (ts === go && ts !== '') {
            passed++;
        } else {
            console.log(`❌ [불일치] 구문 오류 케이스: ${code}`);
            console.log(`-- TS --\n${ts}`);
            console.log(`-- Go --\n${go}\n`);
        }
    }

    console.log(`=========================================`);
    console.log(`총 실행된 코드 블록: ${total}개`);
    if (passed === total) {
        console.log(`✅ 모든 코드 블록의 출력이 완벽하게 일치합니다! (${passed}/${total})`);
    } else {
        console.log(`🚨 ${total - passed}개의 테스트 출력이 불일치합니다. (${passed}/${total})`);
        process.exit(1);
    }
}

main().catch(console.error);





