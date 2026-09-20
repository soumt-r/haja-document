## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)

## 코드 정리 규칙

- 소스 파일을 직접 Edit하세요. `patch.py`처럼 문자열 치환으로 소스를 고치는 1회성 스크립트를
  만들지 마세요 — 실행 후 방치되어 커밋까지 되는 일이 반복됐습니다.
- 실험적으로 만드는 `debug_*`류 스크립트나 `test_results.txt` 같은 출력물은 커밋하지 마세요.
  `.gitignore`에 이미 패턴이 등록되어 있습니다.
- `compare_tests.ts`(TS 엔진 vs `../hana` Go 엔진 출력 비교 도구)는 유지보수 가치가 있는
  실제 도구입니다 — 위 규칙과 혼동해 지우지 마세요.

## 엔진 에러 문구 (생성 파일 주의)

`src/utils/haja/errCatalog.ts`는 `../hana`(Go)의 `errs` 카탈로그에서 **생성되는 파일**이라
직접 고치지 마세요. 에러 문구를 바꾸려면 `hana/errs/{ko,ja,en}.go`를 고치고
`cd ../hana && go run ./cmd/errsgen ../haja-docs/src/utils/haja/errCatalog.ts ../kanade-docs/src/utils/kanade/errCatalog.ts`
로 두 저장소 파일을 함께 다시 만드세요 (`-check`를 앞에 붙이면 오래됐는지만 확인).
엔진에서 에러를 던질 때는 `throw new RuntimeError(Codes.X, ...)`(`errs.ts`)를 쓰고 한국어/영어 리터럴을 직접 쓰지 마세요.
`compare_tests.ts`는 Go 엔진과 출력뿐 아니라 최종 에러 문구도 비교합니다.

`src/utils/haja/stdNames.ts`도 `../hana`(Go)의 `std` 이름표에서 **생성되는 파일**입니다. 직접 고치지 말고 `hana/std`를 고친 뒤
`cd ../hana && go run ./cmd/stdgen -haja ../haja-docs/src/utils/haja/stdNames.ts -kanade ../kanade-docs/src/utils/kanade/stdNames.ts`
로 다시 만드세요(`-check` 옵션으로 최신 여부 확인). `stdNames.ts`에 `nativeOnly: true`가 붙은 모듈은 hana 실행기에서만 쓸 수 있는 것(파일 등)이라 `stdImpls.ts`에 구현하지 않습니다 — `stdlib.ts`가 이름만 기억해 두고 임포트하면 `ImportNativeOnly` 에러를 내요. 새 네이티브 함수의 동작은 `stdImpls.ts`의 `nativeImpls`에 ID로 구현합니다(Go의 `hana/std/stdimpl`을 손으로 미러링한 것 — 먼저 Go를 고치고 여기를 맞추세요. `compare_tests.ts`의 '표준:' 케이스가 결과를 비교해요).

구문 오류도 Go와 같습니다: 파서가 알 수 없는 토큰과 글자를 `parser.diagnostics`(줄·열)로 모아 두고, `index.ts`(실행)와 `hajaLSP.ts`(편집기 밑줄)가 `errs.ts`의 `syntaxError`/`message`로 같은 문구를 냅니다. 문구는 `hana/errs`의 `SyntaxError.*` 코드에서 생성되며, `compare_tests.ts`가 Go와 문구를 비교합니다.

`src/utils/haja/lspKeywords.ts`도 `hana/lsp`의 키워드 표에서 **생성되는 파일**입니다(`hajaLSP.ts`의 자동완성이 씀). 직접 고치지 말고 `cd ../hana && go run ./cmd/lspgen -haja ../haja-docs/src/utils/haja/lspKeywords.ts -kanade ../kanade-docs/src/utils/kanade/lspKeywords.ts`로 다시 만드세요(`-check`로 최신 여부 확인).

선언한 타입 검사(`typecheck.ts`, `types.ts`)는 Go의 `typecheck`/`vm/types.go`와 같은 규칙을 손으로 미러링한 것입니다. 규칙을 바꾸면 Go를 먼저 고치고 여기를 맞추세요. `compare_tests.ts`의 '타입:' 케이스가 문구까지 비교합니다.

## 문서 코드 블록

튜토리얼의 코드 블록은 ` ```haja `(브라우저에서 실행할 수 없는 예제는 ` ```haja fail `)만 쓰세요. ` ```text `처럼 다른 언어 이름을 쓰면 사이트가 코드 블록으로 꾸미지 않아 어두운 배경에 글자가 안 보입니다(13장에서 실제로 겪음). `fail` 블록은 doctest가 "에러가 나야 통과"로 검사합니다. 네트워크나 상대 프로그램이 있어야 하는 예제는 ` ```haja skip `으로 쓰면 doctest와 `compare_tests.ts`가 실행하지 않고 보여 주기만 합니다(14·15장). 명령어·폴더 구조·JSON처럼 실행하지 않는 글은 ` ```bash `나 ` ```json `으로 쓰세요(코드 언어 이름이 없는 ` ``` `는 실행 버튼이 달린 예제 편집기가 됩니다).
