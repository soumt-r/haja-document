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
