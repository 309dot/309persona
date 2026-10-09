# 309persona 고도화 계획 (2026-10)

> 작성일: 2026-10-09 · 기준 커밋 `8f7f581` (2026-03-10, 현재 운영 배포와 동일)
> 범위: 현황 점검 → 버그·설정 정리 → 의존성 현대화 → LLM 파이프라인 재설계 → 제품 고도화
> 표기: ✅ 이번 점검에서 재현/확인함 · ❓ 운영 환경 값 확인 필요

---

## 0. 요약

- 마지막 작업(2026-03-10) 이후 7개월. 프론트·백엔드 핵심 의존성 대부분이 **메이저 버전 1~2개 뒤처져** 있다 (Vite 7→8, Tailwind 3→4, TypeScript 5→7, ESLint 9→10, FastAPI 0.115→0.143(Starlette 1.x), openai SDK 1→3, firebase-admin 6→7). 단 TypeScript 7은 린트 도구가 아직 지원하지 않아 이번엔 6.0까지만 올린다.
- 업그레이드보다 먼저 고쳐야 할 **실제로 동작하지 않는 부분**이 있다: 문서대로 설정하면 서버가 부팅 실패, 질문 한도 3 vs 5 불일치, 퍼널 A/B 실험이 구조적으로 집계 불가, "메모리 주입" 기능 미동작, 좋은 케이스 스터디가 답변에 안 쓰임 등 (§2-1).
- 답변 품질 문제의 근본 원인은 "모델 품질 + 지시문·사실이 섞인 지식베이스 + 약한 검색"이다. 지금은 이를 키워드 필터, 최대 4회 LLM 재호출, 고정 템플릿 답변으로 덮고 있다. **파이프라인 단순화(재설계)가 고도화의 핵심**이다.
- 순서: Phase 0(현황 확인·작업 기반) → 1(버그·설정 핫픽스) → 2(의존성·툴체인) → 3(LLM 파이프라인) → 4(제품 기능). 각 Phase는 독립 PR로 배포 가능하다.
- 시작 전에 정할 것: ① LLM을 로컬 Ollama로 유지할지 호스팅 API로 갈지 ② 백엔드를 Render에 둘지 Vercel로 합칠지 ③ 지식베이스 최신화 범위 (§3).

---

## 1. 현재 구성

| 영역 | 현재 | 비고 |
|---|---|---|
| 프론트 | React 19.2 · Vite 7.2 · Tailwind 3.4 · TypeScript 5.9 · React Router 7.10 · Firebase JS 12 | Vercel 프로젝트 `309persona` (Node 24.x). 도메인 `309designlab.com`, `www.309designlab.com` → **사이트 메인 페이지** |
| 백엔드 | FastAPI 0.115 · Pydantic 2.9 · Python 3.11 (Dockerfile) | 운영 번들이 `https://three09persona.onrender.com/api` 를 호출 → Render ✅ |
| LLM | OpenAI 호환 클라이언트, 기본값 Ollama `qwen3:32b` | Render가 실제로 어떤 LLM에 붙어 있는지 ❓ |
| 검색(RAG) | 기본 `lexical` (공백 기준 토큰 bag-of-words 코사인) / 옵션 pgvector hybrid | hybrid는 DB가 없으면 자동으로 lexical |
| 데이터 | Firestore `visitors`, `conversations`, `funnel_events` · Firebase Auth(관리자) | |
| 개발 흐름 | Cursor plans · Taskmaster · OpenClaw 에이전트(Mac mini) | CI 없음, 테스트는 스크립트 수동 실행 |

이번 점검에서 직접 돌려본 결과:

- 프론트: `npm ci` ✅ · `eslint .` 에러 0 ✅ · `npm run build` ✅
  - 방문자 첫 화면이 받는 JS: `index` 60KB + `vendor` 184KB + `react-vendor` 226KB + `firebase-vendor` 332KB (gzip 합계 약 250KB) + 폰트 `PretendardVariable.woff2` 2.06MB
- 백엔드: `scripts/answer_quality_smoke_test.py` PASS ✅ · TestClient로 한 세션에서 질문 5회 → **4·5번째가 "질문 수 초과"로 차단됨** ✅ (기본값 기준)

---

## 2. 점검 결과

### 2-1. 먼저 고쳐야 할 버그

| # | 문제 | 근거 | 영향 |
|---|---|---|---|
| B1 | README/env.sample 형식(`ALLOWED_ORIGINS=a,b`)대로 넣으면 **서버 부팅 실패**(`SettingsError`) ✅. `json_loads`는 pydantic-settings v2에 없는 키라 무시됨 | `backend/app/core/config.py:29-34, 71-122` | 새 환경 세팅 시 바로 막힘. `infra/local-mac/start-api.sh`가 `.env.local`을 JSON 배열로 고쳐 쓰는 우회만 있음 |
| B2 | 질문 한도 불일치: 프론트 5회 vs 백엔드 기본 3회(in-memory) ✅ | `frontend/src/pages/PersonaChatV2Page.tsx:32`, `backend/app/core/config.py:86`, `backend/env.sample` | 운영값이 3이면 4·5번째 질문은 차단 → "5개 질문 완료" 흐름·퍼널이 성립 안 함 ❓ |
| B3 | 퍼널 집계 3중 고장 ✅: ① 서버는 `funnel_events`에 쓰는데 리포트 스크립트는 `personaFunnelEvents`를 읽음 ② `variant`가 `properties` 안에 중첩 ③ `landing_view`/`chat_view`는 세션이 생기기 전에 1회용 ref가 소진돼 **한 번도 기록되지 않음** | `backend/app/services/conversation_service.py:51`, `backend/scripts/funnel_report.py:34`, `backend/scripts/funnel_winner_decision.py:32`, `PersonaChatV2Page.tsx:507-520` | 대시보드의 4단계 퍼널은 동작하지만, question-first A/B 실험 리포트는 "표본 부족"으로 결론이 날 수 없는 구조 |
| B4 | "decision/failure 메모리 주입"이 실제로 동작 안 함 ✅ (`ROOT`가 `backend/`로 잡혀 `memory/`를 못 찾음) | `backend/app/services/context_planner.py:8, 57-72` | 있다고 믿는 기능이 dead code. 애초에 개발 에이전트용 메모리를 방문자 답변 컨텍스트에 넣는 설계 자체가 부적절 |
| B5 | 지시문 문서(`developer_prompt.md`, `guardrails.md`, `qa_base.md` 등)가 RAG "사실" 청크로 색인됨(지시문 키워드 기준 13개) ✅ | `backend/app/services/knowledge_base.py:80-174` | 답변에 템플릿·규칙 문구 유출 → 금칙어 필터가 계속 늘어난 원인 |
| B6 | 가장 좋은 근거 자료(`knowledge_base/309agent_knowledge_base/`의 페이히어 DS, 핀테크 PM, 디자인 라이브러리 케이스 등)를 런타임이 **읽지 않음** ✅(기본 `KNOWLEDGE_PACK_PATH` 기준 — 경로를 바꾸면 반대로 페르소나·이력서 문서가 빠짐). 같은 파일이 폴더 2곳에 중복 | `knowledge_base.py:83` (팩 파일 옆 `309files/`만 로드) | 실제 사례가 답변에 거의 안 쓰임 |
| B7 | 프론트가 키워드 없는 질문 뒤에 "(맥락: …)" 문구를 붙여 전송 → 그대로 Firestore 로그·검색 쿼리에 들어감 | `PersonaChatV2Page.tsx:124-128, 649` | 대시보드 질문 로그 오염, 검색 품질 저하 |
| B8 | 방문자가 모달로 입력한 이름·소속이 **백엔드로 전달되지 않음** (클라이언트 Firestore 로깅이 기본 off) | `PersonaChatV2Page.tsx:372-392, 712-723` | "알려주시면 맥락에 맞춰 답변"이라는 약속이 실제로는 반영 안 됨 |
| B9 | 페이지 로드마다 세션 생성(봇·새로고침 포함), 세션 미저장 | `PersonaChatV2Page.tsx:394-435` | 방문자 수 부풀림, 새로고침하면 5회 한도 리셋 |
| B10 | LLM 클라이언트 타임아웃 미설정(SDK 기본 600초 + 재시도 2회) + 질문당 최대 4회 순차 호출 | `backend/app/services/llm_service.py:28-37, 217-294` | 모델이 느리거나 죽으면 응답이 매우 길어지거나 매달림 |
| B11 | 관리자 API 접근 제어가 환경변수 설정에 전적으로 의존하고, 설정이 빠졌을 때 기본으로 막히지 않는 구조(fail-open) | `backend/app/core/auth.py` | 방문자 개인정보가 담긴 대시보드 보호 강화 필요 ❓ 운영값 확인 |
| B12 | 범위 밖 질문도 모두 통과 ✅ ("오늘 날씨 어때?", "파이썬으로 정렬 짜줘" → `general` 허용). QA 문서는 차단을 기대 | `backend/app/services/question_filter.py:141-143`, `qa/test-plan.md` | 정책·문서 불일치 |

### 2-2. 오래된 의존성·설정

**의존성** (2026-10-09 npm/PyPI 기준)

프론트 (`frontend/package.json`)

| 패키지 | 현재 | 최신 | 구분 | 메모 |
|---|---|---|---|---|
| react / react-dom | 19.2.0 | 19.3.0 | 마이너 | |
| react-router-dom | 7.10.0 | 7.18.4 | 마이너 | **7.12.0에 보안 수정 3건** → Phase 1에서 바로 적용. React Router 8(2026-06)은 `react-router-dom` 패키지를 없앴으므로 import를 `react-router`로 바꿔 대비만 |
| vite | 7.2.6 | 8.3.4 | **메이저** | Rolldown·Oxc 기반, Node 20.19+ 또는 22.12+ 필요. 지금 설정도 빌드는 되지만 `rollupOptions`·함수형 `manualChunks`는 deprecated → `build.rolldownOptions.output.codeSplitting`으로 이전, `__dirname` → `import.meta.dirname` |
| @vitejs/plugin-react | 5.1.1 | 6.1.2 | **메이저** | Vite 8 전용, Babel 제거(옵션 없이 `react()`만 쓰므로 영향 없음) |
| tailwindcss | 3.4.14 | 4.3.3 | **메이저** | `npx @tailwindcss/upgrade` + `@tailwindcss/vite`. 설정은 CSS `@theme`로 이동. 지원 브라우저 하한 Safari 16.4 / Chrome 111 / Firefox 128. `shadow-sm→shadow-xs` 같은 이름 변경은 도구가 처리, 색 없는 `border`의 기본색이 currentColor로 바뀌는 건 육안 점검 |
| typescript | 5.9.3 | 7.0.2 | **메이저** | 7은 Go 기반 새 컴파일러(2026-07 정식)인데 JS API가 없어 typescript-eslint(지원 범위 `<6.1`)와 함께 못 씀 → **이번엔 6.0.x까지**. `baseUrl` 제거 + `paths`를 `./src/assets/*`처럼 상대경로로 |
| eslint / @eslint/js | 9.39.1 | 10.12.0 / 10.0.1 | **메이저** | 지금 flat config 그대로 로드됨. recommended에 규칙 3개 추가(`no-useless-assignment` 등) |
| typescript-eslint | 8.48.1 | 8.71.1 | 마이너 | |
| eslint-plugin-react-hooks | 7.0.1 | 7.1.1 | 마이너 | ESLint 10 지원, `set-state-in-effect` 규칙 강화 |
| eslint-plugin-react-refresh | 0.4.24 | 0.5.7 | 0.x 메이저 | ESM 전용, `reactRefresh.configs.vite()` 함수 호출로 변경 |
| globals | 16.5.0 | 17.13.0 | 메이저 | |
| firebase | 12.6.0 | 13.0.0 | **메이저** | 13.0.0은 10/7 출시, 깨지는 변경은 AI Logic뿐(app/auth/firestore 영향 없음) → 우선 12.19, 13은 안정화 후 |
| lucide-react | 0.577.0 | 1.54.0 | **메이저** | 브랜드 아이콘 제거·`aria-hidden` 기본값. 쓰고 있는 아이콘 5개는 별칭으로 그대로 동작 |
| uuid | 13.0.0 | 14.0.2 | 메이저 | `crypto.randomUUID()`로 대체하고 의존성 제거 권장(HTTPS·localhost에서만 동작하는 점만 유의) |
| tailwind-merge | 3.5.0 | 3.7.0 | 마이너 | |
| @types/node | 24.10.1 | 26.6.4 | — | 런타임(Node 24)에 맞춰 24.x 유지 |

백엔드 (`backend/requirements.txt`)

| 패키지 | 현재 | 최신 | 구분 | 메모 |
|---|---|---|---|---|
| Python (Docker) | 3.11 | 3.14 권장 | 마이너 | 3.13은 2026-10부터 보안 패치만. 필요한 휠은 3.14까지 모두 있음. firebase-admin CI가 3.13까지라 스모크 테스트 후 결정(안 되면 3.13) |
| fastapi | 0.115.5 | 0.143.0 | 0.x 다수 | Starlette 1.0이 `on_event`를 없앴지만 FastAPI가 재구현해 경고와 함께 동작 → lifespan으로 전환. **0.132부터 Content-Type 없는 JSON 요청은 422** |
| starlette (간접) | 0.41.3 | 1.7.0 | **메이저** | |
| uvicorn | 0.32.1 | 0.54.0 | 0.x 다수 | Python ≥3.10 |
| pydantic / pydantic-settings | 2.9.2 / 2.6.1 | 2.14.0 / 2.15.0 | 마이너 | B1 해결에 쓰는 `NoDecode`가 2.7부터라 Phase 1에서 함께 올림 |
| openai | 1.55.3 | 3.27.0 | **메이저 2단계** | 쓰고 있는 `chat.completions`·`embeddings`는 그대로. 임베딩 기본 전송 형식이 base64로 바뀌어 `encoding_format="float"` 명시 권장 |
| firebase-admin | 6.5.0 | 7.7.0 | **메이저** | 쓰고 있는 API는 모두 유지, Python ≥3.9 |
| psycopg[binary] | 3.2.9 | 3.3.6 | 마이너 | pgvector 경로를 계속 쓸 때만 필요 |
| python-dotenv | 1.0.1 | 1.2.4 | 마이너 | pydantic-settings가 대신하므로 스크립트 전용 |

**설정 파일**

- `vercel.json`: 레거시 `routes` 사용 → `rewrites`로 교체 필요. 보안 헤더·캐시 헤더 없음
- Node: 로컬 22 vs Vercel 24.x(기본값), `.nvmrc`/`engines` 없음. Vercel에서 Node 20은 2026-10부터 deprecated, Node 26은 10/28 LTS 예정 → 지금은 24.x 고정
- Python: Dockerfile 3.11, lock 파일 없음(직접 의존성만 고정), `.python-version`은 gitignore 처리됨
- 품질 도구: 백엔드 ruff/타입체크 없음, 프론트 테스트 없음, GitHub Actions 없음, Dependabot/Renovate 없음 → **방치하면 다시 오래되는 구조**
- `backend/Dockerfile`: root로 실행, HEALTHCHECK 없음, PDF(11MB)까지 이미지에 복사
- `infra/docker-compose.staging.yml`: 폐기된 `version` 키
- 문서 불일치: README는 OpenAI 키·`.env`·`plan/` 폴더를 안내(실제는 Ollama 기본·`.env.local`·`plan/` 없음), 배포 문서는 Cloud Run/Railway(실제 Render), `docs/vector-rag-p1-implementation.md`는 1536차원(SQL은 768차원)

### 2-3. 구조 문제: LLM 파이프라인

지금 질문 1건의 처리 흐름:

```
question_filter(키워드) → lexical 검색 → 키워드 rerank("2024" 가산점 하드코딩)
→ LLM 호출 → 금칙어/반복 문구/길이 검사 → 최대 3회 재호출
→ 그래도 안 되면 rag_fallback 고정 문단("설계-개발 리드타임이 단축됐고…")
```

- **휴리스틱 리스트 15개 이상**(금칙어, 반복 문구, 아티팩트 마커, 의도 키워드 등)이 서로 얽혀 있다. 3월 9~10일 이틀 동안의 커밋 50개 중 상당수가 "하나 고치면 다른 데서 깨지는" 루프였다.
- `rag_fallback.py`의 고정 문단은 근거와 무관한 성과 문장을 309의 목소리로 말한다 → 시스템 프롬프트의 "허구의 성과를 만들지 않는다" 원칙과 충돌. LLM이 죽어도 방문자·운영자 모두 알 수 없다(알림 없음).
- **단발성 Q&A**: 이전 대화를 모델에 보내지 않아 "그 프로젝트에서 어려웠던 점은?" 같은 후속 질문이 안 된다.
- **스트리밍 없음**: 최대 4회 호출이 끝날 때까지 로딩 점만 보인다.
- 지식베이스는 중복 제거 시 수만 자 수준으로 작다. 최신 호스팅 모델이라면 **검색 없이 전체 주입 + 프롬프트 캐싱**이 더 단순하고 정확하다.

### 2-4. 프론트 성능·UX

- 방문자 페이지(`/persona`)가 관리자 전용 Firebase SDK(332KB)를 프리로드한다. 라우트 코드 스플리팅 없음(`frontend/src/App.tsx`에서 모든 페이지 정적 import).
- `manualChunks`가 `react-markdown|remark-gfm|unified`만 분리 → micromark/mdast 등 실제 마크다운 의존성은 즉시 로드되는 `vendor`에 들어가 동적 import 효과가 없다 (`frontend/vite.config.ts:14-30`).
- Pretendard Variable 원본 woff2 2.06MB를 통째로 받는다 → `pretendard` 패키지의 `pretendardvariable-dynamic-subset.css`(92개 조각, 조각당 8~44KB)로 바꾸면 화면에 쓰인 글자 조각만 받는다.
- `<html lang="en">`, meta description/OG 태그 없음 — 메인 도메인인데 카톡·슬랙·링크드인 링크 미리보기가 비어 있다.
- 접근성: 모달에 role/포커스 트랩/ESC 없음, 입력창 label 없음.
- 레거시: `/entry`, `/chat` 라우트(ChatPage에 "Craftwork Icons $59" 템플릿 잔재), 미사용 컴포넌트 5개, 열리지 않는 `ConsentModal`/`HeroInfoModal`, 아무것도 안 하는 `TypingText`, 참조 없는 `.figma-assets/` 26개, `public/vite.svg`.
- 포트폴리오 PDF(9.6MB)를 raw.githubusercontent.com에서 직접 받는다.

### 2-5. 보안·개인정보

- 레이트리밋이 세션 단위 in-memory라 남용 방지 효과가 약하다. 재배포 시 초기화되고 인스턴스가 여러 개면 무력화된다 → 외부 저장소 + IP 기준으로 전환.
- `question` 최대 길이 없음, 퍼널 `properties`는 임의 dict를 무제한 저장, 공개 엔드포인트에 봇 방어 없음.
- 개인정보 고지: `ConsentModal`은 코드에만 있고 열리지 않는다(문구의 "EU 리전"도 사실인지 확인 필요 ❓). 이름·소속·대화를 저장하고 있으니 고지를 복구해야 하고, 외부 LLM API를 쓰게 되면 처리 위탁 고지도 추가해야 한다.

### 2-6. 운영·관측성

- 에러 트래킹·업타임 모니터·알림이 없다 → LLM 장애 시 고정 템플릿 답변으로 조용히 품질이 떨어진다.
- Render가 무료 플랜이면 유휴 후 슬립 → 첫 방문자가 콜드스타트를 기다린다 ❓
- 로컬 LLM 운영 스크립트는 macOS `nohup` + Cloudflare quick tunnel(재시작마다 URL이 바뀜) 기반이라 상시 운영에 취약하다.

---

## 3. 시작 전에 정할 것

### D1. LLM 전략

| | A. 호스팅 API (권장) | B. 로컬 Ollama 유지 |
|---|---|---|
| 모델 예 | Claude Haiku 5.5(빠름) / Sonnet 5.5(품질). AI Gateway를 쓰면 여러 모델을 같은 인터페이스로 비교 가능 | Qwen 계열 최신 모델 + Mac mini |
| 품질 | 한국어·지시 이행이 좋아 휴리스틱 대부분 삭제 가능 | 지금 수준, 휴리스틱 유지 필요 |
| 가용성 | 상시 | 맥 전원·네트워크·터널에 종속 |
| 비용 | 토큰 과금. 트래픽이 적어 소액 예상 — Phase 0에서 실제 월 질문 수로 산정 | 전기료 외 0 |
| 데이터 | 질문이 외부 API로 전송 → 고지 필요 | 로컬에 머묾 |

권장: A를 기본으로, B는 개발·백업 경로로 남긴다. 이미 OpenAI 호환 인터페이스라 전환 비용이 낮다.

### D2. 백엔드 호스팅

- **A. Render 유지** — 변경 최소. 상시 인스턴스 플랜 권장.
- **B. Vercel로 통합 (D1=A일 때 권장)** — FastAPI 공식 지원. `vercel.json`의 `services`로 지금 폴더 구조(`frontend/`, `backend/`) 그대로 한 프로젝트에 올리고 `/api/*`만 백엔드로 보내는 구성이 가능하다(도입 전 플랜·제약 확인). 같은 도메인이라 CORS가 사라지고, PR마다 프론트+백엔드 프리뷰 배포, 스트리밍 가능. 대신 in-memory 상태를 못 쓰므로 레이트리밋을 Firestore나 Redis로 옮겨야 한다.
- **C. Cloud Run** — Firebase와 같은 GCP. 최소 인스턴스 비용 발생.

### D3. 지식베이스 최신화 범위

- 2024년 이후 작업(309persona, 309agent, 디자인 라이브러리 등)을 반영할지, 공개 범위를 어디까지 할지.

---

## 4. 단계별 계획

규모: S = 한 세션(몇 시간) · M = 1~2일 · L = 3일 이상

### Phase 0 — 현황 확인 & 작업 기반 (S)

- [ ] 운영값 확인: Render env(`MAX_SESSION_QUESTIONS`, `OPENAI_BASE_URL`/`OPENAI_MODEL`, `ADMIN_ALLOWED_EMAILS`, `RAG_MODE`), Render 플랜, LLM 실제 연결 여부(질문 1회로 고정 템플릿 답변이 나오는지)
- [ ] Firestore에서 최근 6개월 세션·질문 수 집계 → 비용 산정, 평가셋 재료
- [ ] 개발 환경: `CLAUDE.md`(구조·명령·규칙), `.nvmrc`(24), `engines`, 클라우드 세션용 SessionStart 훅(의존성 자동 설치), `.claude/settings.json` 권한
- [ ] CI(GitHub Actions): 프론트 lint·typecheck·build, 백엔드 스모크 테스트
- [ ] 개발 산출물 정리 결정: `.cursor/`, `.taskmaster/`, `history_log/`, `memory/` → `docs/archive/`로 이동 또는 삭제
- [ ] 2025-12부터 열려 있는 vercel[bot] draft PR 2개(Vercel Web Analytics) 정리 — 필요하면 Phase 4 관측성에서 다시 적용

완료 기준: CI 통과, 운영 실태 표 작성 완료

### Phase 1 — 버그·설정 핫픽스 (M, 메이저 업그레이드 없이)

- **PR 1-1 백엔드 설정**: B1(pydantic-settings 2.15로 올리고 `NoDecode`로 쉼표 목록 파싱), env 파일명 통일, B10(타임아웃·재시도 축소), `on_event` → lifespan, B11(기본 차단 + 이메일 인증 확인), `question` 최대 길이, 퍼널 `properties` 크기 제한
- **PR 1-2 세션·한도**: 한도를 백엔드 한 곳에서 정하고 응답에 `remaining` 포함 → 프론트는 그 값만 표시(B2), 세션은 첫 질문 시 생성 + localStorage 유지(B9), B7 제거, 프로필 업데이트 API로 B8 해결
- **PR 1-3 퍼널 복구**: B3(컬렉션 통일, `variant` 최상위, 세션 생성 전 이벤트는 큐에 쌓았다가 전송), 리포트 스크립트 수정
- **PR 1-4 지식베이스 정리**: 지시문과 사실 분리(B5), 케이스 스터디 연결·중복 제거(B6), 죽은 메모리 주입 제거(B4)
- **PR 1-5 프론트 정리**: react-router-dom 7.18(보안 수정), `services/api.ts`의 헤더 병합 순서 수정(`...options`가 `Content-Type`을 덮어씀 — FastAPI 0.132+의 422 대비), 레거시 라우트·미사용 컴포넌트·에셋 삭제, `lang="ko"`, OG/meta 태그, `vercel.json` rewrites + 헤더, README·배포 문서 현행화

완료 기준: README만 보고 새 환경에서 로컬 실행 가능, 5회 질문이 끝까지 정상 동작, 퍼널 리포트에 실데이터 출력

### Phase 2 — 의존성·툴체인 현대화 (M~L)

**백엔드 — PR 2-1**

- uv + `pyproject.toml` + `uv.lock`로 전환, `.python-version` 커밋(지금은 gitignore됨)
- FastAPI / Starlette 1.x / uvicorn / pydantic / firebase-admin 7 / openai 3 일괄 업그레이드, `on_event` → lifespan, 임베딩 호출에 `encoding_format="float"` 명시
- Docker 이미지 Python 3.14 (Auth·Firestore 스모크 테스트 통과 시, 아니면 3.13)
- ruff(lint+format) + pytest 도입, `scripts/*smoke*.py`를 pytest로 이관
- Dockerfile: non-root 사용자, HEALTHCHECK, 런타임에 필요한 지식베이스만 복사(PDF 제외)

**프론트 — 한 PR에 한 가지 메이저만**

- **PR 2-2 저위험 일괄 + 성능**: `uuid` → `crypto.randomUUID()`, lucide-react 1.x, firebase 12.19, import를 `react-router`로 정리. 라우트 단위 lazy loading, 방문자 경로에서 Firebase 제거, Pretendard dynamic-subset
- **PR 2-3 Vite 8 + plugin-react 6**: 청크 설정을 `build.rolldownOptions.output.codeSplitting`으로 다시 짜서 마크다운 의존성이 실제로 지연 로드되게, `__dirname` → `import.meta.dirname`
- **PR 2-4 Tailwind 4 (Vite 8 다음, 단독 PR)**: 공식 업그레이드 도구로 변환 → `@theme`에 디자인 토큰 정리(`#0F1324`, `#14151A` 등 하드코딩 색상을 토큰화), PostCSS/autoprefixer 설정 제거
- **PR 2-5 린트·타입**: ESLint 10 + @eslint/js 10 + react-hooks 7.1 + react-refresh 0.5 + globals 17 + **TypeScript 6.0.x**를 함께. `baseUrl` 제거, `paths` 상대경로화
- **미루는 것**: TypeScript 7(typescript-eslint 지원 후), React Router 8, firebase 13(안정화 후), Node 26(Vercel 지원 확인 후)
- **재발 방지**: Renovate(또는 Dependabot) 주간 그룹 업데이트 + CI 번들 크기 예산

완료 기준: 첫 화면 JS(gzip) 절반 이하, 시각 회귀 없음(업그레이드 전후 Playwright 스크린샷 비교 — `309-qa-test` 스킬 활용), CI 통과

### Phase 3 — LLM 파이프라인 재설계 (L)

1. **평가셋 먼저**: `evals/`에 골든 질문 30~50개(실제 로그 + 빠른 질문). 체크 항목: KB에 있는 수치만 쓰는지, 실제 프로젝트를 언급하는지, 내부 문구 유출 0, 범위 밖 질문 응대, 말투, 지연·비용. 현재 파이프라인 점수를 베이스라인으로 저장.
2. **새 파이프라인**
   - 시스템 프롬프트(지시문만) + 지식(사실만, 전체 주입·캐시) + 방문자 프로필 + 세션 대화 이력
   - LLM 1회 호출, SSE 스트리밍. 근거 출처·후속 질문 2~3개·범위 판단은 메타데이터로 함께 반환
   - 실패하면 "지금 답변이 어려워요" + 다시 시도 버튼 (가짜 페르소나 답변 금지)
   - 로그에 model·지연·토큰·에러 기록
3. **휴리스틱 제거**: `answer_quality`, `rag_fallback`, `answer_sanitize`, `context_planner`, `question_filter` 키워드 분류, OpenClaw 경로 — 평가 점수가 베이스라인 이상일 때만 삭제
4. **남용 방지**: 레이트리밋을 외부 저장소로 옮기고 IP 기준 추가, 세션 발급에 봇 방어(Cloudflare Turnstile 등)

완료 기준: 평가셋 점수 ≥ 베이스라인, 첫 토큰 표시 p50 2초 이내, 휴리스틱 코드 대부분 삭제

### Phase 4 — 제품 고도화 (지속)

- 지식베이스 최신화(2025~2026 작업) + KB 편집 가이드
- 답변 아래 "근거" 칩(케이스 스터디·포트폴리오 페이지 링크) → 신뢰도
- 후속 질문 추천 칩 → 5회 완주율 향상
- 답변 피드백(👍/👎) → 대시보드 반영
- 대시보드 v2: 세션별 대화 보기, 실패율·지연·비용, 피드백, (복구된) 퍼널
- "제안하기": mailto → 폼(Firestore 저장 + 메일/슬랙 알림), 일정 예약 링크
- 개인정보 고지 복구, 보관 기간(Firestore TTL), 삭제 요청 흐름
- 관측성: Sentry(프론트·백엔드), 업타임 모니터, LLM 실패율 알림
- (선택) 영어 모드

---

## 5. 리스크와 롤백

| 리스크 | 대응 |
|---|---|
| Vite 8·Tailwind 4로 지원 브라우저 하한 상승(대략 Safari 16.4 / Chrome 111) | GA4에서 방문자 브라우저 분포 확인 후 진행 |
| 메이저 업그레이드로 화면이 미묘하게 바뀜 | 업그레이드 전후 스크린샷 비교, Vercel 프리뷰에서 확인 후 머지 |
| LLM 교체 후 답변 품질 회귀 | 평가셋으로 사전 비교, `LLM_PROVIDER` 같은 플래그로 즉시 롤백 |
| 백엔드 이전 중 장애 | Render를 1~2주 병행 유지, 프론트의 API 주소만 바꿔 되돌림 |

---

## 부록 A. 정리(삭제) 후보

- 프론트: `pages/ChatPage.tsx`, `pages/EntryPage.tsx`, `components/{CategoryChip,ChatBubble,PageShell,StatCard,TextArea}.tsx`(미사용), 레거시 페이지 삭제 후 `components/{NavBar,VisitorModal}.tsx`, `context/SessionContext.tsx`·`hooks/useChatHistory.ts`(레거시 전용), `constants/questions.ts`, `public/vite.svg`, `assets/images/chat-product.png`
- 루트: `.figma-assets/`(미참조 26개)
- 백엔드: OpenClaw subprocess 경로(`llm_service.py:106-153`), `force_intent_answer`, `retrieve_relevant_context`, 죽은 메모리 주입(`context_planner.py`)
- 지식베이스: `309agent_knowledge_base/` 안 중복 사본, 동일한 `309_knowledge_pack.json` 2벌
