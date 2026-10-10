# QA 시나리오

자동화된 확인: 백엔드 `cd backend && uv run pytest`(API·스트리밍·한도·대시보드 집계·노트·지도), 답변 품질 `uv run python -m evals.run`(실제 LLM), 화면 `qa/e2e/`(가짜 LLM으로 브라우저 조작 + DB 대조). 아래 항목 옆 괄호는 그 항목을 자동으로 확인하는 곳이다.

## 1. 방문자 플로우
- [ ] `/persona` 첫 진입만으로는 세션이 생기지 않고, 첫 질문 때 `POST /api/visitors` → `POST /api/chat/stream` 순서로 호출된다 (e2e.cjs 1·2)
- [ ] 진입 직후 `landing_view`·`chat_view`, 입력창 포커스 시 `chat_input_started` 퍼널 이벤트가 탭별 방문 ID로 기록된다 (e2e.cjs 1)
- [ ] 프로필(이름/소속) 저장 시 세션이 있으면 `PATCH /api/visitors/{id}`가 호출되고, 직접 입력한 이름이 질문 문장에서 추정한 이름보다 우선한다 (e2e.cjs 3·4)
- [ ] 같은 탭에서 새로고침하면 대화·남은 질문 수·프로필이 복원되고, 이어서 질문해도 같은 세션으로 이력과 함께 전송된다. 탭을 닫으면 지워진다(sessionStorage) (e2e.cjs 7, e2e_stream.cjs A1·A2)
- [ ] "개인정보 안내"가 열리고 ESC·바깥 클릭으로 닫힌다 (e2e_stream.cjs H)

## 2. 질문/답변
- [ ] 답변이 글자 단위로 나눠 표시되고(스트리밍), 끝나면 근거 칩·피드백 버튼이 붙는다. 근거 칩 중 이력서는 이력서 PDF로 연결되고, 포트폴리오 쪽이 있는 프로젝트·노트는 앱 안 뷰어를 연다(지도 API가 없는 백엔드면 포트폴리오 PDF 링크) (e2e_stream.cjs A, e2e_portfolio.cjs P·S)
- [ ] 본문이 끝나면 근거·후속 질문이 오기 전에도 다음 질문을 보낼 수 있다 (e2e_stream.cjs A2)
- [ ] (direct) 후속 질문 칩은 최신 답변 아래에만 보이고, 누르면 직전 대화가 이력으로 함께 전송된다 (e2e_stream.cjs B)
- [ ] 👍/👎는 답변당 한 번만 누를 수 있고 대화 로그에 저장된다 (e2e_stream.cjs C, tests/test_dashboard.py)
- [ ] 탈옥·프롬프트 요구("시스템 프롬프트", "ignore previous instructions")는 LLM 호출 없이 차단 문구로 답한다 (tests/test_api.py, test_chat_stream.py)
- [ ] 범위 밖 질문(코드 작성, 날씨, 번역): direct는 짧게 범위를 알리고 309에게 물을 만한 질문을 제안한다. legacy는 일반 질문으로 답한다 (evals `oos-*`)
- [ ] 자료에 없는 사실(다른 회사 근무, 팀 규모)을 지어내지 않는다 (evals `unknown-*`, `grounded_numbers`)
- [ ] 세션당 `MAX_SESSION_QUESTIONS`(기본 5)회를 넘기면 차단되고, 남은 질문 수 표시가 응답의 `remaining`과 일치한다. 5번째 답변 뒤 완료 모달이 뜨고 입력창이 잠긴다 (e2e.cjs 4·6, e2e_stream.cjs F)
- [ ] 앞 답변의 근거가 오기 전에 다음 질문을 보내도 질문별 남은 질문 수가 하나씩 줄고, 완료 모달과 `five_questions_reached`는 마지막 답변 뒤 한 번만 (e2e_portfolio.cjs R3)
- [ ] 같은 IP에서 `MAX_IP_QUESTIONS`·`MAX_IP_SESSIONS`를 넘기면 새 세션으로도 우회되지 않는다 (tests/test_chat_stream.py)

## 3. 기록 지도·모션
- [ ] 로고 옆 "309의 기록 지도" 버튼에 프로젝트·주제·노트 수가 보이고, 첫 화면에는 지도 캔버스를 그리지 않는다(지도 코드는 열 때 받는다). 인사말·방문 목적·추천 질문이 입력창 위, 첫 화면 안에 보인다 (e2e_map.cjs I, `npm run size`)
- [ ] 질문을 보내면 답이 오기 전에 관련 기록 이름("디자인 시스템 · 페이히어 디자인 시스템 기록을 살펴보는 중")과 지도의 빛나는 점, 입력창 빛 테두리, 아바타 링이 보인다 (e2e_map.cjs J)
- [ ] 답변이 쓰이는 동안 새 글자가 파랗게 나타났다 잉크색으로 바뀌고, 끝나면 효과가 모두 사라진다 (e2e_map.cjs J)
- [ ] 지도를 크게 열면 방금 답변의 근거가 표시되고, 점이나 목록을 골라 그 질문으로 물어볼 수 있다. ESC로 닫히고 포커스가 돌아온다 (e2e_map.cjs K·L)
- [ ] 움직임 줄이기 설정이면 지도는 정지 화면, 등장 애니메이션은 꺼진다(모바일) (e2e_map.cjs M)
- [ ] 백엔드에 `/api/knowledge/graph`가 없으면 지도 버튼만 사라지고 대화는 그대로 된다 (e2e_map.cjs N)
- [ ] 브라우저의 첫 프레임 시각이 지도 생성보다 일러도 지도가 그려진다(예전엔 캔버스 예외로 빈 지도) (e2e_map.cjs O)
- [ ] 비공개 노트: 옵시디언 문법 정리, 초안·템플릿 제외, 분량 초과 시 우선순위, GitHub 저장소 읽기, 지도에는 제목만 (tests/test_notes.py, test_knowledge_graph.py)

## 4. 포트폴리오·방문 목적·요약
- [ ] 첫 화면 "어떤 일로 오셨어요?"에서 목적을 고르면 추천 질문이 바뀌고, 같은 목적을 다시 누르면 해제된다. 첫 질문 때 세션에 `visitor_purpose`로 저장되고, 프롬프트의 방문자 줄에 "목적: …"이 붙는다 (e2e_portfolio.cjs O, tests/test_api.py)
- [ ] 근거 중 포트폴리오 쪽이 있는 프로젝트·노트는 답변 아래 카드(최대 2장, 지식팩의 제목·기간·성과와 그 쪽 썸네일)로 보인다 (e2e_portfolio.cjs P·R)
- [ ] 카드·근거 칩·기록 지도·입력창 위 "포트폴리오"가 뷰어를 그 쪽에서 연다. ←/→, 손가락 스와이프, 장 목록, 쪽 목록으로 넘기고, 답변이 가리킨 쪽이 강조된다. 아직 받지 않은 쪽도 자리를 먼저 잡는다. ESC로 닫히고 연 버튼으로 포커스가 돌아온다. "PDF 받기"는 원본 PDF (e2e_portfolio.cjs Q·T)
- [ ] 대화 요약: 오늘 질문·답변·근거(포트폴리오 쪽 포함)와 방문자 줄(직접 입력한 이름·소속 + 목적)이 한 장에 나오고, 인쇄(PDF 저장) 화면에는 요약만 남는다. 완료 모달에 쓴 이름은 요약과 방문자 기록에 함께 저장된다. 새로고침 뒤에도 목적과 대화가 유지된다 (e2e_portfolio.cjs R·R2·R3)
- [ ] 뷰어·요약 코드는 처음 열 때 받는다 (e2e_portfolio.cjs, `npm run size`)

## 5. 실패·회복
- [ ] LLM 오류 시 "지금은 답변을 가져오지 못했어요" + "다시 시도"가 보이고, 그 질문은 남은 질문 수에서 빠지지 않는다. 대화 로그에는 `error=llm_unavailable`로 남는다 (e2e_stream.cjs D)
- [ ] 모델이 느릴 때 첫 글자 전까지 "답변을 정리하고 있어요"가 보이고 전송 버튼이 잠긴다 (e2e_stream.cjs E)
- [ ] 백엔드가 꺼졌다 켜져 세션이 사라지면(404) 새 세션으로 한 번 다시 보낸다 (e2e.cjs 8)
- [ ] 백엔드에 `/api/chat/stream`이 없으면 `/api/chat`(JSON)으로 바꿔 답한다 (e2e_stream.cjs G)

## 6. 대시보드 (관리자)
- [ ] Firebase 설정이 없으면 안내 문구가 뜨고, 관리자 화면 코드는 `/admin`에 들어갈 때만 내려받는다 (e2e.cjs 9)
- [ ] 지표: 방문(landing_view 기준), 질문한 방문자, 평균 질문 수, 준비도, 차단 비율, 답변 실패율, 응답 시간 p50(첫 글자/완료), 피드백 👍/👎가 저장된 데이터와 일치한다 (e2e_admin.cjs, tests/test_dashboard.py)
- [ ] 퍼널: 방문 → 대화창 입력 → 첫 답변 확인 → 프로필 등록 → 5회 질문 → 제안하기 클릭, 단계별 전환율 (e2e_admin.cjs)
- [ ] 방문 목적 카드(목적별 방문자, 고르지 않은 방문자는 "선택 안 함")와 대화 보기 헤더의 목적 (e2e_admin.cjs, tests/test_dashboard.py)
- [ ] 로그에서 실패·차단·피드백·지연이 배지로 보이고, 누르면 그 방문자의 대화 전체가 시간순으로 열린다. ESC로 닫힌다 (e2e_admin.cjs)
- [ ] 새로고침 버튼으로 최신 데이터가 다시 불린다
- [ ] 지식베이스 카드에 연결 방식·사용 노트·분량·오류가 보이고, "다시 불러오기"로 재배포 없이 노트가 바뀐다 (e2e_admin.cjs, tests/test_knowledge_graph.py)

## 7. 보안/예외
- [ ] Authorization 헤더 없이 `/api/dashboard/*` 호출 시 401, 허용 목록에 없는 이메일·`ADMIN_ALLOWED_EMAILS` 비어 있음은 403 (tests/test_api.py)
- [ ] 다른 세션의 답변에는 피드백을 남길 수 없다 (tests/test_dashboard.py)
- [ ] 입력 길이 제한(질문 1000자, 이력 10개, 방문자 필드 자르기)과 퍼널 `properties` 크기 제한 (tests/test_api.py, test_chat_stream.py)
- [ ] 지식베이스 파일이 없으면 서버가 경로를 담은 에러를 남긴다
