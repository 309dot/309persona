# 지식베이스

답변 근거가 되는 자료. 폴더마다 런타임에서 쓰이는 방식이 다르다.

| 경로 | 쓰이는 방식 |
|---|---|
| `309_knowledge_pack.json` | 요약·협업 방식·가치관·프로젝트·말투·가드레일. 매 질문의 프롬프트에 들어간다(`KNOWLEDGE_PACK_PATH`). 프로젝트는 direct 파이프라인에서 `P1`·`P2`… 출처가 되고, 제목이 근거 칩과 기록 지도에 그대로 보인다. 프로젝트의 `pages`는 포트폴리오 PDF 쪽 번호(예: `"7-11"`)로, 답변 아래 카드와 포트폴리오 뷰어가 그 쪽을 연다. `allowed_topics`는 기록 지도의 주제 점이 된다 |
| `309files/*.md` | **사실 문서만.** legacy 파이프라인은 빈 줄 기준으로 쪼개 검색(RAG)하고(출처 `doc:파일명#번호`), direct 파이프라인은 전부 프롬프트에 넣는다(출처 `RESUME`·`NOTES` 등, `backend/app/services/knowledge_document.py`). 새 파일을 넣으면 `DOC_SOURCES`에 화면에 보일 이름을 추가한다 |
| `309files/pdf/` | 다운로드용 이력서·포트폴리오 PDF. 프론트가 GitHub raw 주소로 링크하므로 경로를 바꾸지 말 것. 앱 안 포트폴리오 뷰어는 이 PDF를 쪽 이미지로 만든 `frontend/public/portfolio/`를 쓴다. 포트폴리오 PDF를 바꾸면 `python3 frontend/scripts/render_portfolio_pages.py`로 다시 만들고 지식팩 `pages`를 맞춘다 |
| `web_cases.md` | 포트폴리오 사이트의 케이스 스터디. 사이트의 `llms-full.txt`(사이트 레포 `content/works.js`에서 만들어짐)에서 케이스 부분만 고치지 않고 옮긴다. 케이스(`## ` 제목과 `- URL: …/work/슬러그` 줄)마다 출처가 하나다: direct는 `W:슬러그`(제목이 근거 칩에 보임), legacy는 빈 줄 기준 조각 `doc:web_cases/슬러그#번호`의 앞에 케이스 제목과 기간(`- 기간:` 줄)을 붙인다(문단에는 연도가 거의 없어 모델이 연도를 지어냈음). 첫 케이스 위의 머리말(받은 곳·날짜)은 읽지 않는다. 다시 받는 법은 아래 |
| `instructions/` | 말투·답변 형식·금지 규칙 같은 지시문. 색인하지 않는다(사실처럼 검색돼 답변에 새어 나오던 문제 방지) |
| `drafts/` | 이전 개발 에이전트가 정리한 케이스 스터디 초안. 이력서와 대조 전이라 런타임이 읽지 않는다. 내용을 확인한 파일만 `309files/`로 옮긴다 |
| `topic_aliases.json` | 질문 주제 분류용 별칭(`backend/app/services/question_filter.py`). 기록 지도가 질문과 관련된 주제를 고를 때도 쓴다 |
| (비공개) 옵시디언 노트 | 이 레포 밖의 비공개 저장소에 있다. 서버가 `NOTES_GITHUB_*`로 받아 `N:슬러그` 출처로 더한다. 쓰는 법과 설정은 `docs/obsidian-notes.md` |

- `309files/` 문서·사이트 케이스·노트의 전화번호 줄은 읽을 때 빠지고, `309designlab.com`이 아닌 이메일은 가려진다(두 파이프라인 모두).
- 수정 후에는 백엔드를 재시작해야 반영된다(로딩 결과를 캐시함). 노트는 대시보드의 "다시 불러오기"로 재시작 없이 반영된다.
- 내용을 바꾼 뒤에는 `backend/evals`로 답변이 나빠지지 않았는지 확인한다(근거 없는 숫자, 프로젝트 언급).

## 사이트 케이스 다시 받기

사이트의 케이스 글이 바뀌면(예: 사이트 레포의 `refresh-2` 브랜치가 머지되면) 레포 루트에서 다시 받는다. 문장은 고치지 않는다. 사이트 글이 이미 콘텐츠 규칙(고객사 익명, 경쟁사 이름 없음)을 따른다.

```bash
curl -sS https://www.309designlab.com/llms-full.txt -o /tmp/llms-full.txt
{ sed '/^## /,$d' knowledge_base/web_cases.md; sed -n '/^## [0-9]/,$p' /tmp/llms-full.txt; } > /tmp/web_cases.md
mv /tmp/web_cases.md knowledge_base/web_cases.md
```

그다음 머리말의 받은 날짜를 고친다. 새 케이스가 생겼으면 그 이름을 `backend/evals/checks.py`의 `PROJECT_TERMS`에 더한다(빠지면 `uv run pytest`가 잡는다).
