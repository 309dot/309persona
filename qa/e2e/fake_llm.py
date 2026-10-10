"""Minimal OpenAI-compatible chat endpoint and Anthropic Messages endpoint for local QA.

POST /__mode {"mode": "normal" | "fail" | "slow", "delay": seconds, "chunk_delay": seconds} switches behaviour;
{"sources": ["P4", ...]} changes the cited sources (null for the default);
{"claude_mode": "normal" | "fail" | "refusal"} switches the Claude endpoint (/v1/messages).
"""
import asyncio
import json
import time

import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse

app = FastAPI()
calls = []
claude_calls = []
state = {"mode": "normal", "delay": 3.0, "meta_delay": 0.0, "chunk_delay": 0.01, "sources": None, "claude_mode": "normal"}
ANSWER = (
    "페이히어에서는 디자인 시스템이 없어 화면마다 편차가 컸어요. 그래서 토큰과 컴포넌트 기준을 먼저 정의하고, "
    "리뷰 루프에 기준 점검을 묶었어요. 그 결과 디자인 작업 시간이 3.5일에서 1.3일로, 개발 시간이 4일에서 2.5일로 줄었어요. "
    "하나은행 '하나 합' 마이데이터 서비스에서도 흐름을 먼저 정리하고 화면 규칙을 맞추는 방식으로 협업 비용을 줄였어요. "
    "두 프로젝트 모두 문제를 흐름 단위로 다시 정의한 뒤, 결정을 바로 실행 단위로 연결하는 것이 핵심이었어요. "
    "그래서 속도는 빨라지고 변경 대응 시 품질 흔들림은 줄어드는 방향으로 수렴했어요."
)
# What the fake Claude writes, so a check can tell which provider answered.
CLAUDE_ANSWER = (
    "코레일 피복관리 시스템에서는 현장 담당자 인터뷰로 업무 흐름부터 정리했어요. "
    "그다음 화면 규칙을 맞추고 개발자와 우선순위를 함께 정해 일정 안에 열었어요. "
    "SM Entertainment NCT 투어 웹사이트에서도 일정이 빠듯해서, 범위를 먼저 나누고 결정을 빠르게 내리는 방식으로 진행했어요. "
    "두 프로젝트 모두 PM으로서 흐름을 먼저 맞추고 실행 단위로 쪼개는 게 핵심이었어요."
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
            await asyncio.sleep(float(state.get("chunk_delay") or 0))  # a slow writer shows the streaming motion
        await asyncio.sleep(float(state.get("meta_delay") or 0))  # a slow model still writing metadata
        meta = json.dumps({**META, "sources": state.get("sources") or META["sources"]}, ensure_ascii=False)
        for start in range(0, len(meta), 12):
            yield chunk(body, meta[start:start + 12])
            await asyncio.sleep(0.01)
        yield chunk(body, finish="stop")
        if (body.get("stream_options") or {}).get("include_usage"):
            yield chunk(body, usage={"prompt_tokens": 4200, "completion_tokens": 320, "total_tokens": 4520})
        yield "data: [DONE]\n\n"

    return StreamingResponse(events(), media_type="text/event-stream")


def sse(event, data):
    return f"event: {event}\ndata: {json.dumps({'type': event, **data}, ensure_ascii=False)}\n\n"


@app.post("/v1/messages")
async def messages(req: Request):
    body = await req.json()
    claude_calls.append({"body": body, "api_key": req.headers.get("x-api-key"), "version": req.headers.get("anthropic-version")})
    mode = state["claude_mode"]
    if mode == "fail":
        return JSONResponse({"type": "error", "error": {"type": "overloaded_error", "message": "fake outage"}}, status_code=529)
    refused = mode == "refusal"
    stop = {"stop_reason": "refusal" if refused else "end_turn", "stop_sequence": None, "stop_details": None}
    if refused:
        stop["stop_details"] = {"type": "refusal", "category": None, "explanation": "fake refusal"}
    text = "" if refused else CLAUDE_ANSWER + "\n<<<META>>>\n" + json.dumps({**META, "sources": ["P6", "P7"]}, ensure_ascii=False)
    usage = {"input_tokens": 40, "cache_read_input_tokens": 9000, "cache_creation_input_tokens": 0, "output_tokens": 180}
    message = {"id": "msg_fake", "type": "message", "role": "assistant", "model": body.get("model"), "container": None}
    # Adaptive thinking: a thinking block (text omitted) comes before the answer.
    thinking = {"type": "thinking", "thinking": "", "signature": "fake-signature"}
    if not body.get("stream"):
        content = [thinking] + ([{"type": "text", "text": CLAUDE_ANSWER, "citations": None}] if not refused else [])
        return {**message, **stop, "content": content, "usage": usage}

    async def events():
        yield sse("message_start", {"message": {**message, "content": [], "stop_reason": None, "stop_sequence": None,
                                                "stop_details": None, "usage": {**usage, "output_tokens": 1}}})
        yield sse("content_block_start", {"index": 0, "content_block": {"type": "thinking", "thinking": "", "signature": ""}})
        yield sse("content_block_delta", {"index": 0, "delta": {"type": "signature_delta", "signature": "fake-signature"}})
        yield sse("content_block_stop", {"index": 0})
        if text:
            yield sse("content_block_start", {"index": 1, "content_block": {"type": "text", "text": "", "citations": None}})
            for start in range(0, len(text), 12):
                yield sse("content_block_delta", {"index": 1, "delta": {"type": "text_delta", "text": text[start:start + 12]}})
                await asyncio.sleep(float(state.get("chunk_delay") or 0))
            yield sse("content_block_stop", {"index": 1})
        yield sse("message_delta", {"delta": {**stop, "container": None}, "usage": {"output_tokens": 180}})
        yield sse("message_stop", {})

    return StreamingResponse(events(), media_type="text/event-stream")


@app.get("/__claude_calls")
def get_claude_calls():
    last = claude_calls[-1] if claude_calls else None
    body = last["body"] if last else {}
    return {
        "count": len(claude_calls),
        "api_key": bool(last and last["api_key"]),
        "version": last["version"] if last else None,
        "model": body.get("model"),
        "keys": sorted(body),
        "system": body.get("system"),
        "output_config": body.get("output_config"),
        "max_tokens": body.get("max_tokens"),
        "roles": [m["role"] for m in body.get("messages", [])],
        "stream": bool(body.get("stream")),
    }


@app.get("/__calls")
def get_calls():
    last = calls[-1] if calls else None
    return {
        "count": len(calls),
        "last_user": last["messages"][-1]["content"] if last else None,
        "last_roles": [m["role"] for m in last["messages"]] if last else [],
        "last_stream": bool(last and last.get("stream")),
        "last_model": last.get("model") if last else None,
        "last_keys": sorted(last) if last else [],
        "last_reasoning_effort": last.get("reasoning_effort") if last else None,
        "last_max_tokens": last.get("max_tokens") if last else None,
    }


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=11500, log_level="warning")
