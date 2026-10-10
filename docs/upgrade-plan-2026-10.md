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

## 진행 현황 (2026-10-10)

아래 §1~§2는 계획 작성 시점(운영 배포 `8f7f581`) 기준이다. 실행 결과는 여기에 모은다.

| Phase | 상태 | 결과 |
|---|---|---|
| 0 작업 기반 | 완료(운영값 확인·사용량 집계 대기) | CLAUDE.md, Node 24 고정, SessionStart 훅, CI, 개발 산출물 정리 |
| 1 버그·설정 | 완료 | B1~B11 수정, B6·B12 일부(아래 표) |
| 2 의존성·툴체인 | 완료 | 미룬 메이저 4개 빼고 최신. 첫 화면 JS gzip 약 250KB → 93.8KB, 폰트 2.06MB → 339KB(13조각) |
| 3 LLM 파이프라인 | 코드 완료, 전환 대기 | direct 파이프라인·스트리밍·평가셋 구현. 실제 LLM 평가 후 `ANSWER_PIPELINE=direct` 전환과 휴리스틱 삭제 |
| 4 제품 고도화 | 외부 계정 불필요 항목 완료 | 근거 칩, 후속 질문, 피드백, 대시보드 v2, 개인정보 안내 |
| 5 비공개 노트·지도·모션 | 완료(노트 저장소 설정 대기) | 옵시디언 노트 출처, 기록 지도, AI 상태 모션 |
| 6 포트폴리오·목적·요약 | 완료(실제 LLM 평가 전) | 새 이력서(PM 방향) 반영, 포트폴리오 쪽 뷰어, 프로젝트 카드, 방문 목적, 커피챗 요약 |

**버그 상태**

| # | 상태 | 조치 |
|---|---|---|
| B1 | ✅ | `NoDecode` + `split_list`: 쉼표·JSON 배열 둘 다 받음 |
| B2 | ✅ | 한도는 백엔드 `MAX_SESSION_QUESTIONS` 하나, 응답의 `remaining`·`limit`을 프론트가 표시 |
| B3 | ✅ | `funnel_events`로 통일, `variant` 최상위, 이벤트는 탭별 방문 ID로 세션 전에도 기록 |
| B4 | ✅ | 죽은 메모리 주입 코드 제거 |
| B5 | ✅ | 지시문은 `knowledge_base/instructions/`(읽지 않음), `309files/`는 사실만 |
| B6 | ◐ | 중복 사본 제거. 케이스 스터디는 `knowledge_base/drafts/`에 두고 이력서와 대조한 것만 `309files/`로 옮긴다(309 확인 필요) |
| B7 | ✅ | "(맥락: …)" 꼬리 제거 |
| B8 | ✅ | `PATCH /api/visitors/{id}`로 프로필 반영 |
| B9 | ✅ | 세션은 첫 질문 때 생성, 같은 탭 새로고침은 대화·한도 복원(sessionStorage), 같은 IP 질문·세션 수 제한 |
| B10 | ✅ | LLM 타임아웃 45초·재시도 1회·답변 시간 예산 |
| B11 | ✅ | 허용 목록이 비면 403(fail-closed), 이메일 인증 옵션 |
| B12 | ◐ | direct는 모델이 범위를 판단해 짧게 안내(평가셋 `oos-*`), legacy는 그대로. QA 문서 정책 갱신 |

**Phase 2 결과**

- 백엔드: uv + `pyproject.toml` + `uv.lock`, Python 3.13(3.14는 Firestore 자격 증명으로 스모크 테스트를 못 해 보류), ruff + pytest, Dockerfile 비루트·HEALTHCHECK·지식베이스만 복사, CI가 이미지 빌드 후 `/health`·지식베이스 로딩 확인
- 프론트: React 19.3, React Router 7.18(`react-router` 패키지), Vite 8(Rolldown, `codeSplitting`), Tailwind 4(`@tailwindcss/vite`, `@theme` 토큰), ESLint 10, TypeScript 6.0, lucide-react 1.x, firebase 12.19, `uuid` 제거, Pretendard dynamic subset(커밋돼 있던 폰트 67MB 삭제)
- 시각 회귀: 업그레이드마다 Playwright 스크린샷 10장(데스크톱·모바일 × 5화면)을 기준과 비교. 방문자 화면은 픽셀 단위로 같았고, Tailwind 4의 OKLCH 팔레트로 채널당 최대 4/255 차이, 관리자 화면 글자 안티앨리어싱 0.2% 차이
- 재발 방지: Dependabot 주간 묶음 업데이트(npm·uv·Actions, uv PR은 `requirements.txt` 자동 재생성), CI 번들 예산(`npm run size`, 첫 화면 JS 110KB·CSS 25KB)
- 미룬 것: TypeScript 7(typescript-eslint 미지원), React Router 8, firebase 13, `@types/node` 26(런타임 Node 24)

**Phase 3 결과**

- [x] 평가셋 `backend/evals/`: 44문항 + LLM 판정 없는 체크(근거 없는 숫자, 내부 문구 유출, 범위 밖·공격·개인정보 응대, 말투, 프로젝트 언급, 길이), legacy·direct 나란히 비교
- [x] direct 파이프라인(`ANSWER_PIPELINE=direct`): 지식베이스 전체 + 방문자 정보 + 직전 대화 3개로 LLM 한 번 호출, 근거·후속 질문·주제를 메타데이터로 함께 받음. 기본값은 평가 전까지 `legacy`
- [x] SSE 스트리밍(`/api/chat/stream`), 본문이 끝나면 바로 다음 질문 가능(`answer_end`), 구버전 백엔드면 JSON으로 폴백
- [x] 실패하면 "지금 답변을 가져오지 못했어요" + 다시 시도, 그 질문은 한도에서 돌려줌(가짜 답변 금지)
- [x] 로그에 pipeline·model·지연·첫 토큰·토큰 수·에러, 대시보드에 실패율·응답 시간 p50
- [x] IP 기준 질문·세션 수 제한(메모리), `TRUSTED_PROXY_HOPS`로 `X-Forwarded-For` 위조 방지
- [ ] 실제 LLM으로 평가 → 베이스라인 저장 → direct 전환 → legacy 휴리스틱 삭제 (D1 결정과 LLM 접근 필요)
- [ ] 레이트리밋 외부 저장소(Firestore/Redis) — 인스턴스를 여러 개 띄우거나 Vercel로 옮길 때(D2)
- [ ] 세션 발급 봇 방어(Cloudflare Turnstile 등) — 계정 필요
- 완료 기준 중 "첫 토큰 p50 2초"는 실제 모델로만 잴 수 있다. 대시보드와 평가 결과에 첫 토큰 p50이 나온다

**Phase 4 결과**

- [x] 답변 아래 근거 칩(이력서·포트폴리오 PDF로 연결), 후속 질문 칩, 👍/👎 피드백
- [x] 대시보드 v2: 방문 퍼널(방문 → 입력 → 첫 답변 → 프로필 → 5질문 → 제안), 답변 실패율·응답 시간·토큰·피드백 지표, 로그를 누르면 방문자별 대화 전체
- [x] 개인정보 안내 복구(확인되지 않은 "EU 리전" 문구는 뺌)
- [ ] 지식베이스 최신화(2025~2026 작업, D3)와 `drafts/` 검토 — 309의 자료와 확인 필요
- [ ] "제안하기" 폼 + 메일/슬랙 알림 — 알림 채널 결정 필요(지금은 mailto)
- [ ] 보관 기간 정책 + Firestore TTL — 정책을 정한 뒤 개인정보 안내에 기간을 적는다
- [ ] Sentry, 업타임 모니터, LLM 실패율 알림 — 계정 필요
- [ ] (선택) 영어 모드

**검증**

- 백엔드 `uv run pytest` 59개(스트리밍 이벤트 순서, 실패 시 한도 환불, 예비 모델은 첫 글자 전만, IP 한도, 대시보드 집계, 피드백 권한, 평가 체크)
- 브라우저 E2E(`qa/e2e/`, 가짜 LLM + 인메모리 Firestore): 기본 흐름 50개, 스트리밍·근거·후속 질문·피드백·실패 재시도 48개, 대시보드 22개 모두 통과

**Phase 5 결과 (2026-10-10 상담 후: 비공개 노트·기록 지도·모션)**

- [x] 비공개 옵시디언 노트: 비공개 GitHub 저장소(읽기 전용 토큰) 또는 로컬 폴더에서 읽어 옵시디언 문법을 정리하고 `N:슬러그` 출처로 direct·legacy에 더함. 분량 상한과 우선순위, 대시보드의 노트 상태·"다시 불러오기", 볼트 → 저장소 동기화 스크립트(`backend/scripts/sync_obsidian_notes.py`), 설정 가이드 `docs/obsidian-notes.md`
- [x] 기록 지도: `GET /api/knowledge/graph`(제목과 연결만), 질문 `start` 이벤트에 관련 노드 추측, 첫 화면 지도(모이는 인트로·궤도·309 광륜), 지도 크게 보기(점이나 목록을 골라 바로 질문)
- [x] AI 상태 모션: 생각 중(아바타 링·입력창 빛 테두리·"○○ 기록을 살펴보는 중"), 쓰는 중(새 글자가 파랗게 나타나 잉크색으로·말하기 링), 근거 도착(근거 점이 309로 이어지며 퍼짐), 근거 칩에 올리면 지도의 점 강조. 움직임 줄이기 설정을 따르고 지도 코드는 지연 로딩(첫 화면 JS 93.9KB → 95.7KB)
- [x] 추천 질문을 입력창 위에서 인사말 아래로 옮김(모바일에서 인사말을 가리던 문제). 후속 질문이 없는 답변(legacy) 아래에는 아직 묻지 않은 추천 질문
- [x] LLM: 무료 등급(Gemini) 연결 방법과 `LLM_REASONING_EFFORT`(`docs/deployment.md`), 개인정보 안내에 모델 제공사 전송과 무료 등급의 서비스 개선 이용 가능성을 적음
- 검증: 백엔드 pytest 73개, 브라우저 E2E 기본 50·스트리밍 48·지도·모션 35·대시보드 25개 통과

**Phase 6 결과 (2026-10-10: 새 이력서·포트폴리오 뷰어·방문 목적·커피챗 요약)**

- [x] 새 이력서(2026, 프로덕트 매니저/디자이너) 반영: `309files/resume.md`를 새 PDF 기준으로 다시 씀(사실만, 전화번호 없음). 지식팩 요약을 PM 중심으로 고치고 프로젝트 P6(코레일 피복관리 시스템, PM)·P7(SM Entertainment NCT 투어 웹사이트, PM)을 더함. `resume_context_for_ai.md`에 코레일 사례를 넣고 지시문 절은 뺌. 두 프롬프트의 첫 줄, 인사말, 추천 질문도 PM/디자이너로. 새 이력서에 없는 호텔 현존 브랜딩·봉봉랩은 지식베이스에서 뺌
- [x] 포트폴리오 쪽 단위 뷰어: PDF 27쪽을 WebP(뷰어 2000px·카드 800px·목록 240px, 합계 약 2.2MB)로 만들어 정적으로 둠(`frontend/scripts/render_portfolio_pages.py`). 9.6MB PDF를 받지 않고 답변이 가리킨 쪽을 바로 연다. 장 목록·쪽 목록(가리킨 범위 강조), ←/→·ESC, 손가락 스와이프, 이웃 쪽 미리 받기, 불러오는 동안 16:9 자리 유지, "PDF 받기"
- [x] 근거 → 쪽 연결: 지식팩 `pages`(P2 7–11, P4 24–26, P5 13–19)와 노트 속성 `portfolio_pages`. 쪽이 있는 근거 칩, 답변 아래 프로젝트 카드(최대 2장, 지식팩의 제목·기간·성과와 그 쪽 썸네일), 기록 지도, 입력창 위 "포트폴리오"에서 뷰어가 열림. 그래프 API가 없는 백엔드면 근거 칩은 PDF 링크로
- [x] 방문 목적 선택(채용 검토·함께 일할 동료·디자이너·후배·둘러보기): 첫 질문 때 세션에 저장(`visitor_purpose`), 목적별 추천 질문, 프롬프트 방문자 줄의 "목적: …", 대시보드 방문 목적 카드와 대화 보기 헤더
- [x] 커피챗 요약: 오늘 나눈 질문·답변·근거(포트폴리오 쪽 포함)와 방문자 줄을 한 장으로. 브라우저 인쇄로 PDF 저장(인쇄 화면엔 요약만). 입력창 위 "대화 요약"과 5질문 완료 모달에서 열림
- [x] 퍼널 이벤트: `purpose_selected`, `portfolio_opened`(from·page), `portfolio_closed`(본 쪽 수), `summary_opened`(from), `summary_printed`
- [x] 브라우저 QA에서 찾아 고친 것
  - 앞 답변의 근거가 오기 전에 다음 질문을 보내면(본문이 끝나면 보낼 수 있음) `done`의 남은 질문 수가 다음 질문까지 센 세션 값이라, 완료 모달이 두 번 뜨고(두 번째는 요약 위로) `five_questions_reached`가 두 번 기록됨 → 질문별 남은 수는 `start` 값, 완료 모달은 진행 중인 마지막 질문에서만
  - 뷰어에서 아직 받지 않은 쪽으로 건너뛰면 이미지가 0×0으로 접혔다가 펴짐(스와이프도 안 먹힘) → container query로 16:9 자리를 먼저 잡음
  - 완료 모달에 이름을 쓰고 "대화 요약 저장"을 누르면 입력이 사라짐 → 저장한 뒤 요약을 연다
  - 답변이 가리킨 쪽을 벗어나도 뷰어 제목이 그대로 → 지금 장 이름으로
  - 목적 칩이 radio 역할인데 다시 누르면 해제되는 토글로 동작 → `aria-pressed` 토글 버튼으로
  - 대시보드가 통계를 받기 전에 지표를 0으로 보여 줌(대시보드 E2E가 가끔 그 0을 읽음) → 받기 전엔 "–", 테스트는 로그가 온 뒤 확인
- 첫 화면 JS gzip 95.7KB → 97.9KB, CSS 22.7KB(뷰어·요약은 지연 로딩)
- 검증: 백엔드 pytest 76개, 브라우저 E2E 기본 50·스트리밍 48·지도·모션 35·포트폴리오·목적·요약 76·대시보드 26개 통과. E2E는 이제 처리 안 된 예외(`pageerror`)도 실패로 센다
- 아직 못 한 것: 지식베이스·프롬프트를 PM 방향으로 바꾼 뒤의 답변 품질은 실제 LLM 평가 전이다(남은 일 2)

**운영 반영 후 (2026-10-10, PR #3 머지)**

- 프론트(Vercel)·백엔드(Render) 모두 새 버전 배포 확인(`/api/knowledge/graph` 응답)
- 첫 화면에서 기록 지도가 인사말·첫 질문을 아래로 밀어 시작이 어려움(운영 확인 피드백) → 지도는 로고 옆 "309의 기록 지도" 버튼으로 줄이고(누르면 전체 지도), 제목은 한 줄·설명 한 줄로. 데스크톱·모바일 모두 인사말·방문 목적·추천 질문이 입력창 위에 보인다. 지도 캔버스는 열 때 받는다(첫 화면 JS 97.9KB → 97.6KB)
- 운영에서 답변이 나오지 않음: 예전에는 LLM 실패를 고정 문단으로 덮어 드러나지 않았다. LLM 연결(남은 일 1·2)이 필요하다
- legacy 파이프라인도 `LLM_TEMPERATURE`를 따르게 함(고정 0.35/0.45였음). Gemini 3 계열은 기본값 1.0을 권장한다
- 기록 지도가 가끔 빈 화면이 되던 원인: 첫 프레임 시각이 지도 생성 시각보다 이르면 경과 시간이 음수가 되어 궤도 반지름이 음수 → `ctx.ellipse` 예외로 그리기 루프가 멈춤. 경과 시간을 0 아래로 내려가지 않게 고침. E2E가 처리 안 된 예외를 실패로 세면서 드러났고, 프레임 시각을 앞당겨 매번 재현하는 검사를 넣음
- Claude 예비 연결(사용자 결정: Gemini 기본, 예비는 Claude Haiku 5.5): `ANTHROPIC_API_KEY`가 있으면 두 파이프라인 모두 OpenAI 호환 모델이 첫 글자 전에 실패할 때 Claude가 답한다(`services/claude_client.py`, 공식 `anthropic` SDK). OpenAI 호환 키 없이 Claude 키만 있으면 Claude만 쓴다. temperature는 보내지 않고(Haiku 5.5는 400), 지식베이스 시스템 프롬프트는 캐시, 거절(refusal)은 실패로 처리. 대화 로그의 모델은 실제로 답한 모델. legacy 품질 재호출이 실패하면 앞 답을 쓴다(예전에는 질문 전체가 실패). `OPENAI_FALLBACK_MODEL` 기본값을 비움(같은 주소에 없는 `qwen3:32b`를 부르던 문제). 가짜 Claude(`fake_llm.py`의 `/v1/messages`)로 실제 SDK를 돌리는 브라우저 검사 `e2e_claude.cjs`(direct 24·legacy 21)
- 운영 확인(Vercel 임시 실행 환경에서 운영 백엔드로 테스트 질문): 서버·기록 지도·세션은 정상, 답변은 1초 만에 실패. Render 변수가 `Gemini_api_key`·`claude_API_KEY`·`OPENAI_API_KEY`(OpenAI 키, 주소 없음)로 들어 있어 코드가 Gemini·Claude 키를 못 읽고 기본값인 로컬 Ollama 주소로 요청하고 있었다 → 사용자 요청대로 적힌 이름 그대로 읽게 함: `GEMINI_API_KEY`로 Gemini를 1순위로(기본 모델 gemini-3.5-flash-lite, 추론 low, temperature·`stream_options` 안 보냄, `max_tokens` 4096 이상), `CLAUDE_API_KEY`를 `ANTHROPIC_API_KEY` 별칭으로(이름은 대소문자 무관), `OPENAI_BASE_URL`이 로컬 기본값이면 Gemini·Claude 키가 있을 때 건너뜀. QA 스택에 운영과 같은 구성(`QA_GEMINI=1`)을 더해 `e2e_claude.cjs` direct 27·legacy 23

**남은 일 (사용자 확인 필요, 우선순위 순)**

1. Render 환경 변수: LLM 연결(지금 운영에서 답변이 안 나옴 → `docs/deployment.md` "LLM 연결"의 Gemini 값과 "Claude 예비 연결"의 `ANTHROPIC_API_KEY`), `ADMIN_ALLOWED_EMAILS`(비면 대시보드 403), `TRUSTED_PROXY_HOPS`(Render 1)
2. D1: 무료 모델(Gemini 무료 등급)로 결정 → AI Studio 키 발급(`GEMINI_API_KEY`) → `uv run python -m evals.run --pipeline both` → direct 전환 여부 판단. PM 방향으로 바꾼 지식베이스·프롬프트도 이때 함께 확인한다
3. 비공개 노트 저장소·토큰 설정, 노트 샘플 2~3개로 템플릿·변환 확인 → 실제 노트 작성(`docs/obsidian-notes.md`)
4. Firestore 자격 증명이 있는 환경에서 `scripts/usage_report.py --months 6` → 비용 산정, 평가셋 보강
5. 개인정보 보관 기간 결정 → 안내 문구·Firestore TTL
6. `knowledge_base/drafts/` 검토 → 확인된 것만 `309files/`로(옵시디언에 같은 내용이 있으면 그쪽이 원본)
7. 새 이력서 PDF 확인(지식베이스는 아래처럼 정했다)
   - 309designlab 기간이 "2018 - 2023"으로 적혀 있는데 프로젝트는 2024년이다 → 지식베이스는 "2024.01 - 재직 중"
   - "전사 디자인 시스템 도입 및 운영:" 제목이 하나은행·로아인텔리전스·케이비핀테크·유플리트 아래에도 반복됨, 페이히어 POS 항목 중복
   - 포트폴리오 2쪽의 경력(로아 2021.12–2022.07, 팀윙크-알다 2019.08–2021.11)이 이력서(로아 2020.12–2021.06, 케이비핀테크 2019.08–2020.10)와 다름 → 지식베이스는 이력서 기준
8. 포트폴리오 쪽 매핑 확인: P5(POS/재고관리) → 13–19쪽(주문관리·2.0 리뉴얼 장)은 추정이다. P1·P3·P6·P7은 포트폴리오에 쪽이 없다(코레일·NCT 쪽이 생기면 지식팩 `pages`만 채우면 된다). 포트폴리오 PDF를 바꾸면 이미지를 다시 만든다
9. 다음 후보: 맞춤 포트폴리오 PDF(목적별 쪽 묶음), 경력 타임라인 카드, 영어 모드

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

결정(2026-10-10): 무료 모델로 시작. Google Gemini API 무료 등급의 최신 Flash(예비: Flash-Lite)를 OpenAI 호환 주소로 붙인다(`docs/deployment.md` "LLM 연결"). 한국어 품질이 무료 선택지 중 가장 낫고, 컨텍스트가 커서 노트를 다 넣을 수 있다. 대신 하루 요청 한도가 있고, 무료 등급 입력은 제공사의 서비스 개선에 쓰일 수 있다. Groq 같은 무료 등급은 분당 토큰 한도가 프롬프트 한 번 크기와 비슷해 맞지 않았다.

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

- [ ] 운영값 확인: Render env(`MAX_SESSION_QUESTIONS`, `OPENAI_BASE_URL`/`OPENAI_MODEL`, `ADMIN_ALLOWED_EMAILS`, `RAG_MODE`), Render 플랜, LLM 실제 연결 여부(질문 1회로 고정 템플릿 답변이 나오는지) — Render 대시보드 접근이 필요해 사용자 확인 대기
- [ ] Firestore에서 최근 6개월 세션·질문 수 집계 → 비용 산정, 평가셋 재료 — `backend/scripts/usage_report.py` 추가 완료, 자격 증명이 있는 환경에서 실행 대기
- [x] 개발 환경: `CLAUDE.md`, `.nvmrc`(24) + `engines`, 클라우드 세션용 SessionStart 훅(`.claude/hooks/session-start.sh`). 권한 allowlist는 사용 패턴이 쌓인 뒤 `/fewer-permission-prompts`로 만든다
- [x] CI(GitHub Actions, `.github/workflows/ci.yml`): 프론트 lint·typecheck·build, 백엔드 compile + 스모크 테스트 2종(`answer_quality_smoke_test.py`, 신규 `api_smoke_test.py`) — 첫 실행 통과
- [x] 개발 산출물 정리: `.cursor/plans/`, `.taskmaster/`, `history_log/`, `memory/`(+ `update_working_memory.py`) → `docs/archive/`로 이동
- [x] 2025-12부터 열려 있던 vercel[bot] draft PR 2개(Vercel Web Analytics, 내용 동일) 닫음 — Phase 4 관측성에서 재검토

**운영 실태 (2026-10-10)** — 보안 관련 값은 public 레포라 기록하지 않는다

| 항목 | 값 |
|---|---|
| 프론트 | Vercel `309persona`, Node 24.x, `309designlab.com`·`www`, 마지막 운영 배포 2026-03-10(`8f7f581`) |
| 운영 API | `https://three09persona.onrender.com/api` (운영 번들에서 확인) |
| Render 플랜·런타임 | ❓ |
| 운영 LLM(`OPENAI_BASE_URL`/`OPENAI_MODEL`) | ❓ |
| 질문 한도(`MAX_SESSION_QUESTIONS`) | ❓ |
| 월별 세션·질문 수 | ❓ `usage_report.py` 실행 결과로 채움 |

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
