# 309 Knowledge Pack 템플릿

`knowledge_base/309_knowledge_pack.json` 파일은 LLM 프롬프트에 주입되는 핵심 정보를 담고 있습니다. 아래 필드 구조를 유지하면서 필요한 내용을 업데이트하세요.

```json
{
  "summary": "309의 커리어 및 강점을 2~3문단으로 요약",
  "collaboration_style": "협업 방식, 커뮤니케이션 특징",
  "values": "가치관, 일하는 원칙",
  "projects": [
    { "title": "프로젝트명", "impact": "정량/정성 임팩트" }
  ],
  "speaking_style": "답변 톤과 말투",
  "allowed_topics": ["309", "프로젝트", "협업"]
}
```

- `allowed_topics`는 질문 필터가 허용하는 키워드를 확장할 때 사용합니다.
- 프로젝트 배열에는 3~5개의 대표 사례를 넣고, `impact` 필드에 지표나 결과를 명시합니다.
- 새로운 버전을 만들 때는 `knowledge_base/` 폴더에 날짜별 JSON을 저장한 뒤, `backend/.env`에서 `KNOWLEDGE_PACK_PATH`를 해당 파일로 변경하면 됩니다.

## LLM 스모크 테스트

OpenAI 키와 지식베이스가 정상 연결되었는지 확인하려면 다음 스크립트를 실행하세요.

```bash
OPENAI_API_KEY=sk-xxx python3 backend/scripts/persona_smoke.py
```

- `--dry-run` 옵션을 추가하면 실제 OpenAI 호출 없이 주입될 컨텍스트와 유저 페이로드만 출력됩니다.
- `OPENAI_API_KEY`, `KNOWLEDGE_PACK_PATH`, `FIREBASE_*` 환경 변수는 `.env`에 저장하고 스크립트 실행 전 `source` 하거나 `python-dotenv`가 자동으로 읽도록 루트 경로에서 실행하면 됩니다.
- 출력되는 답변을 기반으로 `knowledge_base/309_knowledge_pack.json` 또는 `prompts/system_prompt.txt`를 다듬어 품질을 높일 수 있습니다.
