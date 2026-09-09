---
layout: ../../../layouts/DocLayout.astro
title: 2. 구문 트리(AST) 구조
description: 하자(Haja) 언어의 추상 구문 트리(AST) 명세입니다.
---

# 하자(Haja) 언어 AST (추상 구문 트리) 명세서

이 문서는 하자 언어 파서(`Parser`)가 생성하는 AST(Abstract Syntax Tree)의 노드별 JSON 스키마를 정의해요. 하자 언어의 인터프리터, 컴파일러, 정적 분석기 등 모든 도구는 이 명세서를 기준으로 구현된답니다.

## 1. 프로그램 (Program)
모든 소스 코드의 최상위 노드예요.
```json
{
  "type": "Program",
  "body": [ /* Statement 노드들의 배열 */ ]
}
```

## 2. 선언 및 할당 (Declarations & Assignments)

### VariableDeclaration (변수 선언)
`'이름'을 [타입]인 값으로 정하자/고정하자/준비하자`
```json
{
  "type": "VariableDeclaration",
  "target": { "type": "Identifier", "name": "이름" },
  "typeAnnotation": { "type": "TypeReference", "name": "타입" }, // 타입이 없으면 null
  "value": /* Expression 노드 (준비하자인 경우 null) */,
  "isConst": false, // '고정하자' 인 경우 true
  "isDeclarationOnly": false // '준비하자' 인 경우 true
}
```

### Assignment (값 재할당)
`'이름'을 값으로 정하자`
```json
{
  "type": "Assignment",
  "target": { "type": "Identifier", "name": "이름" } /* 또는 MemberExpression */,
  "value": /* Expression 노드 */
}
```

### Compound Assignments (복합 대입 연산)
`'이름'에 값을 더하자/빼자` 등
```json
{
  "type": "MathAdd", // 더하자
  "target": /* Identifier 또는 MemberExpression */,
  "value": /* Expression 노드 */
}
// 빼자(MathSubtract), 추가하자(ListAppend) 도 동일한 구조
```

## 3. 제어 흐름 (Control Flow)

### IfStatement (조건문)
`만약 (조건) 면: ... 그렇지 않고 만약 (조건) 면: ... 그렇지 않다면: ...`
```json
{
  "type": "IfStatement",
  "condition": /* Expression 노드 */,
  "consequent": [ /* Statement 노드들의 배열 */ ],
  "elifs": [
    {
      "condition": /* Expression 노드 */,
      "consequent": [ /* Statement 노드들의 배열 */ ]
    }
  ],
  "alternate": [ /* Statement 노드들의 배열 (없으면 빈 배열) */ ]
}
```

### SwitchStatement (스위치문)
`'값'에 따라 나누자: "경우1" 인 경우: ... 나머지는: ...`
```json
{
  "type": "SwitchStatement",
  "discriminant": /* Expression 노드 */,
  "cases": [
    {
      "values": [ /* Expression 노드 배열 (쉼표로 여러 조건 가능) */ ],
      "body": [ /* Statement 노드 배열 */ ]
    }
  ],
  "default": [ /* Statement 노드 배열 (없으면 None/null) */ ]
}
```

### FallthroughStatement (스위치 관통)
`다음으로 이어가자`
```json
{
  "type": "FallthroughStatement"
}
```

### WhileLoop (조건 반복문)
`(조건) 동안 반복하자:`
```json
{
  "type": "WhileLoop",
  "condition": /* Expression 노드 */,
  "body": [ /* Statement 노드 배열 */ ]
}
```

### ForEachLoop (배열 순회)
`'배열'의 '항목'마다 반복하자:`
```json
{
  "type": "ForEachLoop",
  "item": { "type": "Identifier", "name": "항목" }, // 순회할 개별 요소의 Identifier 노드
  "iterable": /* Expression 노드 (평가 결과가 List 타입이어야 함) */,
  "body": [ /* Statement 노드 배열 */ ]
}
```

### ForRangeStatement (숫자 범위 반복문)
`1부터 10까지 반복하자 ('횟수'):` 또는 `'시작'부터 '끝'까지 반복하자 ('횟수'):`
```json
{
  "type": "ForRangeStatement",
  "start": /* Expression 노드 */,
  "end": /* Expression 노드 */,
  "iterator": { "type": "Identifier", "name": "횟수" }, // 반복자 변수의 Identifier 노드
  "body": [ /* Statement 노드 배열 */ ]
}
```

### BreakStatement (반복문 탈출)
`반복을 끝내자`
```json
{
  "type": "BreakStatement"
}
```

## 4. 함수 및 객체지향 (Functions & OOP)

### FunctionDeclaration (함수/메서드 선언)
`[리턴타입]을 돌려주는 <함수명>을 만들자 ([타입]인 '인자' = "기본값"):`
```json
{
  "type": "FunctionDeclaration",
  "id": "함수명",
  "accessModifier": "public", // "public", "private", "protected" 중 하나 (명시되지 않으면 public)
  "returnType": { "type": "TypeReference", "name": "리턴타입" }, // 명시되지 않으면 null
  "params": [
    { 
      "type": { "type": "TypeReference", "name": "타입" }, // 명시되지 않으면 null
      "name": "인자이름",
      "default": /* Expression 노드 (기본값이 없으면 null) */
    }
  ],
  "body": [ /* Statement 노드 배열 */ ]
}
```

### ReturnStatement (반환문)
`'값'을 돌려주자`
```json
{
  "type": "ReturnStatement",
  "value": /* Expression 노드 */
}
```

### ClassDeclaration (클래스 선언)
`[부모클래스]를 바탕으로 하고 [인터페이스]를 따르는 [클래스명]을 설계하자:`
```json
{
  "type": "ClassDeclaration",
  "id": "클래스명",
  "baseClass": "부모클래스명", // 상속받는 단일 부모 클래스 (없으면 null)
  "interfaces": [ "인터페이스명1", "인터페이스명2" ], // 구현하는 인터페이스 리스트 (없으면 빈 배열)
  "body": [ /* FunctionDeclaration, ConstructorDeclaration 등 */ ]
}
```

### ConstructorDeclaration (생성자 선언)
`처음 만들어질 때 ('인자') 다음과 같이 하자:`
```json
{
  "type": "ConstructorDeclaration",
  "params": [ /* FunctionDeclaration과 동일한 파라미터 구조 */ ],
  "body": [ /* Statement 노드 배열 */ ]
}
```

### InterfaceDeclaration (인터페이스 선언)
`[인터페이스명]을 규정하자:`
```json
{
  "type": "InterfaceDeclaration",
  "id": "인터페이스명",
  "body": [ /* InterfaceMethod 노드 배열 */ ]
}
```

### InterfaceMethod (인터페이스 메서드 규약)
`<메서드명>이 있어야 한다 ([타입]인 '인자')`
```json
{
  "type": "InterfaceMethod",
  "id": "메서드명",
  "returnType": { "type": "TypeReference", "name": "리턴타입" }, // 명시되지 않으면 null
  "params": [ /* FunctionDeclaration과 동일한 파라미터 구조 */ ]
}
```

## 5. 수식 및 특수 참조 (Expressions & Special References)

### BinaryExpression (이항 연산)
`A + B`, `A 가 B 와 같다`, `A 가 B 의 일종이다` 등
```json
{
  "type": "BinaryExpression",
  "left": /* Expression 노드 */,
  "operator": "+", "-", "*", "==", "<", ">", "instanceof" /* 연산자 기호 */,
  "right": /* Expression 노드 */
}
```

### CallExpression (함수/메서드 호출)
`<함수명>(인자1, 인자2)`
```json
{
  "type": "CallExpression",
  "callee": /* Identifier 또는 MemberExpression */,
  "arguments": [ /* Expression 노드 배열 */ ]
}
```

### NewExpression (인스턴스 생성)
`[클래스명]인 클래스명(인자)`
```json
{
  "type": "NewExpression",
  "class": "클래스명",
  "arguments": [ /* Expression 노드 배열 */ ]
}
```

### MemberExpression (속성/메서드/인덱스 접근)
`'객체'의 '속성'`, `'배열'의 1번째`, `'사전'의 "키"`
```json
{
  "type": "MemberExpression",
  "object": /* Expression 노드 */,
  "property": /* Identifier(속성), FunctionReference(메서드), IndexExpression, LengthLiteral, 또는 Literal(문자열 키) */
}
```

### Special References (특수 참조)
`부모`, `바깥` 예약어예요.
```json
// 부모
{
  "type": "SuperReference"
}

// 바깥
{
  "type": "OuterReference"
}
```

### Identifier (변수명)
`'이름'`
```json
{
  "type": "Identifier",
  "name": "이름"
}
```

### FunctionReference (함수 참조)
`<함수명>`
```json
{
  "type": "FunctionReference",
  "name": "함수명"
}
```

### ExpressionStatement (수식문)
`<함수>()를 실행하자`처럼 수식 자체가 하나의 문장(Statement)으로 쓰일 때 사용해요.
```json
{
  "type": "ExpressionStatement",
  "expression": /* CallExpression 등 Expression 노드 */
}
```

### TypeReference (타입 참조)
타입 정보를 나타내는 노드예요.
```json
{
  "type": "TypeReference",
  "name": "타입명"
}
```

### Literal (기본 리터럴)
숫자, 문자열 리터럴이에요. (템플릿 제외)
```json
{
  "type": "Literal",
  "value": 42 /* 평가된 호스트 언어의 원시 값 (Primitive Value) */,
  "raw": "42" /* 소스 코드 문자열 */
}
```

### TemplateLiteral (템플릿 리터럴)
`틀"문자열 {'변수'} 문자열"`
```json
{
  "type": "TemplateLiteral",
  "strings": [ "문자열 ", " 문자열" ],
  "expressions": [ /* 내포된 Expression 노드 배열 */ ]
}
```

### ListLiteral (배열)
`[1, 2, 3]`
```json
{
  "type": "ListLiteral",
  "elements": [ /* Expression 노드 배열 */ ]
}
```

### DictLiteral (사전)
`{"키": "값"}`
```json
{
  "type": "DictLiteral",
  "elements": [
    {
      "key": /* Expression 노드 */,
      "value": /* Expression 노드 */
    }
  ]
}
```

### IndexExpression (인덱스 접근식)
`1번째`, `'인덱스변수'번째` (여기서 `번째`는 인덱싱을 의미하는 필수 문법 토큰이며, 가독성을 위해 뒤에 붙는 `값`(`1번째 값`) 같은 단어는 파서가 무시하는 옵션 토큰(Syntactic Sugar)이에요.)
```json
{
  "type": "IndexExpression",
  "index": /* Expression 노드 (평가 결과가 반드시 정수여야 함) */
}
```

### LengthLiteral (길이)
`길이`
```json
{
  "type": "LengthLiteral",
  "value": "길이"
}
```

## 6. 모듈 및 예외 (Modules & Exceptions)

### ImportStatement (모듈 가져오기)
`"모듈명"에서 전부 가져오자`
```json
{
  "type": "ImportStatement",
  "module": "모듈명"
}
```

### TryStatement (예외 처리문)
`일단 해보자: ... 오류가 발생했다면 ('에러'): ... 마무리는 항상: ...`
```json
{
  "type": "TryStatement",
  "block": [ /* Statement 노드 배열 (try 블록) */ ],
  "handler": {
    "type": "CatchClause",
    "param": { "type": "Identifier", "name": "에러식별자명" }, // 에러 객체가 바인딩될 Identifier 노드
    "body": [ /* Statement 노드 배열 (catch 블록) */ ]
  }, // 오류 처리 블록이 없으면 null
  "finalizer": [ /* Statement 노드 배열 (finally 블록) */ ] // 없으면 null
}
```

### ThrowStatement (오류 발생)
`[오류]("메시지")를 발생시키자`
```json
{
  "type": "ThrowStatement",
  "error": /* Expression 노드 (보통 NewExpression으로 생성된 예외 객체) */
}
```

## 7. 입출력 및 기타 (I/O & Others)

### PrintStatement (출력문)
`"메시지"를 출력하자`
```json
{
  "type": "PrintStatement",
  "value": /* Expression 노드 */
}
```

### PrintInlineStatement (이어 출력문)
`"메시지"를 이어출력하자`
```json
{
  "type": "PrintInlineStatement",
  "value": /* Expression 노드 */
}
```

### InputStatement (입력문)
`'변수'를 [타입]으로 입력받자` 또는 `'변수'를 입력받자`
```json
{
  "type": "InputStatement",
  "target": { "type": "Identifier", "name": "변수" }, // 입력값을 저장할 변수의 Identifier 노드
  "typeAnnotation": { "type": "TypeReference", "name": "타입" } // 기대하는 타입 (생략 시 기본적으로 "문자열")
}
```
