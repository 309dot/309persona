"""Minimal OpenAI-compatible chat endpoint for local QA (streaming and non-streaming).

POST /__mode {"mode": "normal" | "fail" | "slow", "delay": seconds} switches behaviour.
"""
import asyncio
import json
import time

import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse

app = FastAPI()
calls = []
state = {"mode": "normal", "delay": 3.0, "meta_delay": 0.0}
ANSWER = (
    "페이히어에서는 디자인 시스템이 없어 화면마다 편차가 컸어요. 그래서 토큰과 컴포넌트 기준을 먼저 정의하고, "
    "리뷰 루프에 기준 점검을 묶었어요. 그 결과 디자인 작업 시간이 3.5일에서 1.3일로, 개발 시간이 4일에서 2.5일로 줄었어요. "
    "하나은행 '하나 합' 마이데이터 서비스에서도 흐름을 먼저 정리하고 화면 규칙을 맞추는 방식으로 협업 비용을 줄였어요. "
    "두 프로젝트 모두 문제를 흐름 단위로 다시 정의한 뒤, 결정을 바로 실행 단위로 연결하는 것이 핵심이었어요. "
    "그래서 속도는 빨라지고 변경 대응 시 품질 흔들림은 줄어드는 방향으로 수렴했어요."
)
META = {
    "sources": ["P2", "P3", "RESUME"],
    "follow_ups": ["디자인 시스템을 팀에 정착시킨 방법은?", "하나 합에서 맡은 역할은?"],
    "topic": "design_system",
}


def chunk(body, content=None, usage=None, finish=None):
    data = {
        "id": "fake", "object": "chat.completion.chunk", "created": int(time.time()), "model": body.get("model"),
        "choices": [] if content is None and finish is None else [
            {"index": 0, "delta": {"content": content} if content is not None else {}, "finish_reason": finish}
        ],
    }
    if usage:
        data["usage"] = usage
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


@app.post("/__mode")
async def set_mode(req: Request):
    state.update(await req.json())
    return state


@app.post("/v1/chat/completions")
async def chat(req: Request):
    body = await req.json()
    calls.append(body)
    if state["mode"] == "fail":
        return JSONResponse({"error": {"message": "fake outage", "type": "server_error"}}, status_code=500)
    if state["mode"] == "slow":
        await asyncio.sleep(float(state["delay"]))
    if not body.get("stream"):
        return {
            "id": "fake", "object": "chat.completion", "created": int(time.time()), "model": body.get("model"),
            "choices": [{"index": 0, "finish_reason": "stop", "message": {"role": "assistant", "content": ANSWER}}],
            "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
        }

    async def events():
        answer = ANSWER + "\n<<<META>>>\n"
        for start in range(0, len(answer), 12):
            yield chunk(body, answer[start:start + 12])
            await asyncio.sleep(0.01)
        await asyncio.sleep(float(state.get("meta_delay") or 0))  # a slow model still writing metadata
        meta = json.dumps(META, ensure_ascii=False)
        for start in range(0, len(meta), 12):
            yield chunk(body, meta[start:start + 12])
            await asyncio.sleep(0.01)
        yield chunk(body, finish="stop")
        if (body.get("stream_options") or {}).get("include_usage"):
            yield chunk(body, usage={"prompt_tokens": 4200, "completion_tokens": 320, "total_tokens": 4520})
        yield "data: [DONE]\n\n"

    return StreamingResponse(events(), media_type="text/event-stream")


@app.get("/__calls")
def get_calls():
    last = calls[-1] if calls else None
    return {
        "count": len(calls),
        "last_user": last["messages"][-1]["content"] if last else None,
        "last_roles": [m["role"] for m in last["messages"]] if last else [],
        "last_stream": bool(last and last.get("stream")),
    }


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=11500, log_level="warning")
