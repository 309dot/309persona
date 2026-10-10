# 브라우저 E2E

실제 백엔드와 프론트 빌드를 띄우고 Playwright로 화면을 조작한 뒤, 화면 값과 DB에 남은 값을 대조한다. LLM은 `fake_llm.py`(OpenAI 호환, 스트리밍·실패·지연 모드), Firestore는 `backend/tests/fake_firestore.py`(메모리)로 대신한다. 브라우저 설치가 필요해 CI에는 넣지 않았다.

## 준비

- `backend/.venv` (`cd backend && uv sync`), `frontend/node_modules` (`cd frontend && npm ci`)
- Playwright와 Chromium: `npm i -g playwright && npx playwright install chromium`
  (Claude Code 클라우드 환경에는 `/opt/node22/lib/node_modules`에 설치돼 있다)

## 실행 (레포 루트에서)

```bash
export NODE_PATH=$(npm root -g)

# 1) 기본(legacy) 흐름: 첫 질문 시 세션 생성, 프로필 저장, 한도, 새로고침 복원, 백엔드 장애·재시작 복구, /admin 지연 로딩 (50개)
qa/e2e/stack.sh build && qa/e2e/stack.sh restart
node qa/e2e/e2e.cjs

# 2) direct 파이프라인: 스트리밍, 새로고침 뒤 이어서 질문, 근거 칩, 후속 질문(대화 이력 전달), 피드백, 실패→다시 시도, 지연, 한도, 구버전 백엔드 폴백, 개인정보 안내 (48개)
ANSWER_PIPELINE=direct qa/e2e/stack.sh restart
node qa/e2e/e2e_stream.cjs

# 3) 대시보드: 시드 데이터 → 로그인(Firebase Auth REST 응답을 가짜로) → 지표 값 대조 → 방문자 대화 보기 (22개)
qa/e2e/stack.sh build-admin && QA_FAKE_ADMIN=1 ANSWER_PIPELINE=direct qa/e2e/stack.sh restart
node qa/e2e/e2e_admin.cjs

qa/e2e/stack.sh stop
```

- 각 스크립트는 체크마다 `PASS`/`FAIL`을 찍고, 하나라도 실패하면 종료 코드 1이다.
- `QA_FAKE_ADMIN=1`은 어떤 ID 토큰이든 `owner@309.so`로 받아 준다. QA 스택(`run_backend.py`)에서만 쓰인다.
- `e2e.cjs`는 장애 재현을 위해 백엔드를 직접 죽였다 띄운다. 끝나면 `stack.sh stop`으로 정리한다.
- 로그·결과는 `qa/e2e/.logs/`, 스크린샷은 `qa/e2e/shots/`(둘 다 gitignore).

## 시각 회귀

시계를 고정하고 애니메이션을 끄기 때문에 같은 빌드는 픽셀 단위로 같게 나온다.

```bash
node qa/e2e/visual.cjs qa/e2e/shots/before      # 변경 전 빌드로 스택을 띄운 상태에서
node qa/e2e/visual.cjs qa/e2e/shots/after       # 변경 후
python3 qa/e2e/compare.py qa/e2e/shots/before qa/e2e/shots/after qa/e2e/shots/diff
```

`compare.py`는 화면별로 바뀐 픽셀 비율을 찍고, 바뀐 곳을 빨갛게 칠한 이미지를 `diff/`에 남긴다.
