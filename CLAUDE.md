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
로 다시 만드세요(`-check` 옵션으로 최신 여부 확인). 새 네이티브 함수의 동작은 `stdlib.ts`의 `nativeImpls`에 ID로 구현합니다.

구문 오류도 Go와 같습니다: 파서가 알 수 없는 토큰과 글자를 `parser.diagnostics`(줄·열)로 모아 두고, `index.ts`(실행)와 `hajaLSP.ts`(편집기 밑줄)가 `errs.ts`의 `syntaxError`/`message`로 같은 문구를 냅니다. 문구는 `hana/errs`의 `SyntaxError.*` 코드에서 생성되며, `compare_tests.ts`가 Go와 문구를 비교합니다.

`src/utils/haja/lspKeywords.ts`도 `hana/lsp`의 키워드 표에서 **생성되는 파일**입니다(`hajaLSP.ts`의 자동완성이 씀). 직접 고치지 말고 `cd ../hana && go run ./cmd/lspgen -haja ../haja-docs/src/utils/haja/lspKeywords.ts -kanade ../kanade-docs/src/utils/kanade/lspKeywords.ts`로 다시 만드세요(`-check`로 최신 여부 확인).
