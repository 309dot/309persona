# qwen3.5 로컬 서버 전환 가이드 (llama.cpp)

## 목적
Ollama에 qwen3.5 태그가 없는 환경에서, **로컬 qwen3.5 GGUF**를 직접 구동해 309persona와 persona-answer-local에 연결합니다.

## 1) 준비
- `brew install llama.cpp` (완료)
- qwen3.5 GGUF 파일 확보 (예: `~/models/qwen3.5-14b-instruct-q4_k_m.gguf`)

## 2) 서버 실행
```bash
cd projects/309persona
chmod +x infra/local-qwen35/*.sh
export QWEN35_MODEL_PATH=~/models/<your-qwen3.5>.gguf
export QWEN35_PORT=8011
infra/local-qwen35/start-qwen35-server.sh
infra/local-qwen35/status-qwen35-server.sh
```

## 3) 309persona 백엔드 연결
`backend/.env.local` 설정:
```env
OPENAI_BASE_URL=http://127.0.0.1:8011/v1
OPENAI_API_KEY=local
OPENAI_MODEL=qwen3.5
OPENAI_FALLBACK_MODEL=qwen3.5
```

서버 재기동:
```bash
infra/local-mac/stop-api.sh
infra/local-mac/start-api.sh
```

## 4) persona-answer-local 에이전트 연결
openclaw는 모델 문자열만 고정하므로 `persona-answer-local` 모델을 `openai/qwen3.5`처럼 API 호환 모델 식별자로 맞춰 운용하거나,
309persona 백엔드에서 OpenClaw agent-hop을 끄고 직접 qwen3.5 서버를 호출합니다.

## 5) 검증
```bash
curl -sS http://127.0.0.1:8011/health
curl -sS http://127.0.0.1:8000/api/health
```

## 주의
- 모델 파일 경로가 없으면 실행되지 않습니다.
- GGUF 종류(Q4/Q5/Q8)에 따라 속도/품질/메모리 사용량이 크게 달라집니다.
