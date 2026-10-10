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

# 3) 기록 지도·모션: 로고 옆 지도 버튼·첫 화면 높이, 생각 중 관련 기록, 쓰는 중 잉크 효과, 근거 표시, 지도에서 질문, 움직임 줄이기, 지도 없는 백엔드, 첫 프레임 시각 (37개)
QA_NOTES=1 ANSWER_PIPELINE=direct qa/e2e/stack.sh restart
node qa/e2e/e2e_map.cjs

# 4) 포트폴리오·방문 목적·요약: 목적 선택 → 세션·프롬프트, 근거 칩·프로젝트 카드, 포트폴리오 뷰어(키보드·스와이프·장/쪽 목록·늦게 오는 쪽),
#    대화 요약과 인쇄 화면, 겹쳐 보낸 질문의 남은 수·완료 모달, 지도 없는 백엔드, 모바일 (76개)
QA_NOTES=1 ANSWER_PIPELINE=direct qa/e2e/stack.sh restart
node qa/e2e/e2e_portfolio.cjs

# 5) 대시보드: 시드 데이터 → 로그인(Firebase Auth REST 응답을 가짜로) → 지표 값 대조 → 방문 목적 → 방문자 대화 보기 → 노트 상태·다시 불러오기 (26개)
qa/e2e/stack.sh build-admin && QA_FAKE_ADMIN=1 QA_NOTES=1 ANSWER_PIPELINE=direct qa/e2e/stack.sh restart
node qa/e2e/e2e_admin.cjs

qa/e2e/stack.sh stop
```

- 각 스크립트는 체크마다 `PASS`/`FAIL`을 찍고, 하나라도 실패하면 종료 코드 1이다.
- `QA_FAKE_ADMIN=1`은 어떤 ID 토큰이든 `owner@309.so`로 받아 준다. QA 스택(`run_backend.py`)에서만 쓰인다.
- `QA_NOTES=1`은 `qa/e2e/notes/309-persona/`의 가짜 옵시디언 노트를 비공개 노트로 읽힌다(실제 노트가 아니다).
- 가짜 LLM은 `POST /__mode {"chunk_delay": 0.08}`처럼 글자 조각 사이 간격을 늘려 스트리밍 모션을 눈으로 볼 수 있다. `{"sources": ["P4", "P5"]}`는 답변 근거를 바꾼다(`null`이면 기본값).
- 각 스위트는 DB 값을 처음부터 센다. 스위트마다 스택을 새로 띄운다.
- 스택을 다시 띄우는 `stack.sh restart`는 다른 명령과 한 줄로 묶지 않는다. 안의 `pkill -f`가 같은 줄의 문자열에 걸려 셸까지 끝낼 수 있다.
- `e2e.cjs`는 장애 재현을 위해 백엔드를 직접 죽였다 띄운다. 끝나면 `stack.sh stop`으로 정리한다.
- 로그·결과는 `qa/e2e/.logs/`, 스크린샷은 `qa/e2e/shots/`(둘 다 gitignore).

## 시각 회귀

시계를 고정하고 움직임 줄이기(`reducedMotion: 'reduce'`)로 애니메이션을 끄기 때문에 같은 빌드는 픽셀 단위로 같게 나온다. 기록 지도는 시드가 고정된 레이아웃이라 정지 화면도 매번 같다.

```bash
node qa/e2e/visual.cjs qa/e2e/shots/before      # 변경 전 빌드로 스택을 띄운 상태에서
node qa/e2e/visual.cjs qa/e2e/shots/after       # 변경 후
python3 qa/e2e/compare.py qa/e2e/shots/before qa/e2e/shots/after qa/e2e/shots/diff
```

`compare.py`는 화면별로 바뀐 픽셀 비율을 찍고, 바뀐 곳을 빨갛게 칠한 이미지를 `diff/`에 남긴다.
