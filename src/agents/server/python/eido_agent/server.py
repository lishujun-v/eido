"""FastAPI server for the Eido agent runtime."""

from __future__ import annotations

import time
import json
import logging
import re
from collections.abc import AsyncIterator
from typing import Any, Literal
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field

from .config import AgentConfig
from .llm import LLMProviderError
from .models import AgentLLMSettings, AgentProfile, UserRecord
from .runtime import AgentRuntime


logger = logging.getLogger(__name__)


class CreateAgentRequest(BaseModel):
    id: str
    name: str
    bio: str = ""
    capabilities: str = ""
    allowed_providers: list[str] = Field(default_factory=list)
    llm: AgentLLMSettings = Field(default_factory=AgentLLMSettings)
    workspace_dir: str = ""
    owner_user_id: str | None = None
    values: list[str] = Field(default_factory=list)
    speaking_style: str = ""
    boundaries: list[str] = Field(default_factory=list)
    public_facts: dict[str, Any] = Field(default_factory=dict)
    private_facts: dict[str, Any] = Field(default_factory=dict)
    handoff_policy: str | None = None


class CreateUserRequest(BaseModel):
    id: str
    email: str | None = None
    name: str = ""


class ChatRequest(BaseModel):
    agent_id: str
    message: str
    images: list[str] = Field(default_factory=list)
    attachment_paths: list[str] = Field(default_factory=list)
    model: str | None = None
    session_id: str | None = None
    visitor_id: str | None = None
    stream: bool = False
    slash_command: str | None = None
    working_directory: str | None = None
    permission_mode: Literal["auto", "smart", "manual"] = "smart"
    project_context: dict[str, Any] | None = None


class GraphRunRequest(BaseModel):
    graph_id: str
    agent_id: str
    input: str = ""
    run_id: str | None = None
    interaction_response: str = ""


class OpenAIChatRequest(BaseModel):
    model: str | None = None
    agent_id: str
    messages: list[dict[str, Any]]
    session_id: str | None = None
    visitor_id: str | None = None
    stream: bool = False


class InteractionResponseRequest(BaseModel):
    response: str
    responder_id: str | None = None


def create_app(runtime: AgentRuntime | None = None) -> FastAPI:
    runtime = runtime or AgentRuntime(AgentConfig.from_env())
    app = FastAPI(title="Eido Agent API", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.state.runtime = runtime
    logger.info(
        "Eido agent API initialized data_dir=%s provider=%s model=%s mock=%s",
        runtime.config.data_dir,
        runtime.config.provider,
        runtime.config.model,
        runtime.provider.is_mock,
    )

    @app.get("/health")
    async def health() -> dict[str, Any]:
        return {
            "status": "ok",
            "provider": runtime.config.provider,
            "model": runtime.config.model,
            "mock": runtime.provider.is_mock,
        }

    @app.post("/users")
    async def upsert_user(req: CreateUserRequest) -> dict[str, Any]:
        logger.info("Upserting user user_id=%s", req.id)
        user = runtime.create_user(UserRecord(**req.model_dump()))
        return {"user": user.model_dump()}

    @app.get("/users/{user_id}")
    async def get_user(user_id: str) -> dict[str, Any]:
        user = runtime.get_user(user_id)
        if user is None:
            raise HTTPException(status_code=404, detail="User not found")
        agent = runtime.store.load_agent_for_user(user_id)
        return {
            "user": user.model_dump(),
            "agent": _public_agent(agent) if agent else None,
        }

    @app.get("/agents")
    async def list_agents(owner_user_id: str | None = Query(default=None)) -> dict[str, Any]:
        logger.info("Listing agents owner_user_id=%s", owner_user_id)
        return {"agents": [_public_agent(agent) for agent in runtime.list_agents(owner_user_id=owner_user_id)]}

    @app.post("/agents")
    async def create_agent(req: CreateAgentRequest) -> dict[str, Any]:
        logger.info(
            "Creating agent agent_id=%s owner_user_id=%s provider_count=%d",
            req.id,
            req.owner_user_id,
            len(req.llm.providers),
        )
        payload = req.model_dump()
        if payload.get("handoff_policy") is None:
            payload.pop("handoff_policy", None)
        try:
            profile = runtime.create_agent(AgentProfile(**payload))
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        return {"agent": _public_agent(profile)}

    @app.get("/agents/{agent_id}")
    async def get_agent(agent_id: str) -> dict[str, Any]:
        profile = runtime.get_agent(agent_id)
        if profile is None:
            raise HTTPException(status_code=404, detail="Agent not found")
        return {"agent": _public_agent(profile)}

    @app.post("/chat", response_model=None)
    async def chat(req: ChatRequest) -> Response | dict[str, Any]:
        logger.info(
            "Chat request received agent_id=%s session_id=%s visitor_id=%s model=%s stream=%s",
            req.agent_id,
            req.session_id,
            req.visitor_id,
            req.model,
            req.stream,
        )
        if req.stream:
            return StreamingResponse(
                _chat_stream(runtime, req),
                media_type="application/x-ndjson",
                headers={"Cache-Control": "no-cache, no-transform"},
            )
        try:
            return await runtime.chat(
                agent_id=req.agent_id,
                message=req.message,
                images=req.images,
                attachment_paths=req.attachment_paths,
                model=req.model,
                session_id=req.session_id,
                visitor_id=req.visitor_id,
                slash_command=req.slash_command,
                working_directory=req.working_directory,
                permission_mode=req.permission_mode,
                project_context=req.project_context,
            )
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except Exception as exc:
            logger.exception(
                "Chat failed agent_id=%s session_id=%s model=%s",
                req.agent_id,
                req.session_id,
                req.model,
            )
            raise HTTPException(status_code=502, detail=_error_detail("模型请求失败", exc)) from exc

    @app.delete("/chat/{session_id}")
    async def stop_chat(session_id: str) -> dict[str, Any]:
        return {"session_id": session_id, "stopped": runtime.cancel_chat(session_id)}

    @app.post("/sessions/{session_id}/interactions/{interaction_id}/respond")
    async def respond_interaction(
        session_id: str, interaction_id: str, req: InteractionResponseRequest,
    ) -> dict[str, Any]:
        try:
            return runtime.respond_to_interaction(
                session_id=session_id, interaction_id=interaction_id,
                response=req.response, responder_id=req.responder_id,
            )
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except PermissionError as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.post("/graphs/run")
    async def run_graph(req: GraphRunRequest) -> dict[str, Any]:
        try:
            run = runtime.submit_graph(
                graph_id=req.graph_id, agent_id=req.agent_id, input_text=req.input,
                run_id=req.run_id, interaction_response=req.interaction_response,
            )
            return {"run": run.to_dict()}
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except Exception as exc:
            logger.exception("Graph run failed graph_id=%s agent_id=%s", req.graph_id, req.agent_id)
            raise HTTPException(status_code=502, detail=_error_detail("Graph 运行失败", exc)) from exc

    @app.get("/graphs/run/{graph_id}/{run_id}")
    async def get_graph_run(graph_id: str, run_id: str, agent_id: str = Query(...)) -> dict[str, Any]:
        try:
            return {"run": runtime.get_graph_run(graph_id=graph_id, agent_id=agent_id, run_id=run_id).to_dict()}
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @app.get("/graphs/run/{graph_id}/{run_id}/events")
    async def graph_run_events(graph_id: str, run_id: str, agent_id: str = Query(...)) -> Response:
        async def generate() -> AsyncIterator[str]:
            try:
                async for event in runtime.stream_graph_run_events(
                    graph_id=graph_id, agent_id=agent_id, run_id=run_id
                ):
                    yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
            except KeyError as exc:
                yield f"data: {json.dumps({'type': 'error', 'error': str(exc)}, ensure_ascii=False)}\n\n"
            except Exception as exc:
                logger.exception("Graph event stream failed graph_id=%s run_id=%s", graph_id, run_id)
                yield f"data: {json.dumps({'type': 'error', 'error': _error_detail('实时状态推送失败', exc)}, ensure_ascii=False)}\n\n"

        return StreamingResponse(
            generate(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache, no-transform",
                "X-Accel-Buffering": "no",
                "Connection": "keep-alive",
            },
        )

    @app.post("/v1/chat/completions")
    async def chat_completions(req: OpenAIChatRequest) -> dict[str, Any]:
        logger.info(
            "OpenAI-compatible chat request received agent_id=%s session_id=%s visitor_id=%s stream=%s message_count=%d",
            req.agent_id,
            req.session_id,
            req.visitor_id,
            req.stream,
            len(req.messages),
        )
        if req.stream:
            raise HTTPException(status_code=400, detail="Streaming is not implemented yet. Use /chat for normal calls.")
        user_messages = [m for m in req.messages if m.get("role") == "user"]
        if not user_messages:
            raise HTTPException(status_code=400, detail="At least one user message is required")
        content = user_messages[-1].get("content") or ""
        if isinstance(content, list):
            content = "\n".join(str(part.get("text", "")) for part in content if isinstance(part, dict))
        try:
            result = await runtime.chat(
                agent_id=req.agent_id,
                message=str(content),
                model=req.model,
                session_id=req.session_id,
                visitor_id=req.visitor_id,
            )
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except Exception as exc:
            logger.exception(
                "OpenAI-compatible chat failed agent_id=%s session_id=%s model=%s",
                req.agent_id,
                req.session_id,
                req.model,
            )
            raise HTTPException(status_code=502, detail=_error_detail("模型请求失败", exc)) from exc
        return {
            "id": f"chatcmpl-{uuid4().hex[:12]}",
            "object": "chat.completion",
            "created": int(time.time()),
            "model": req.model or runtime.config.model,
            "choices": [
                {
                    "index": 0,
                    "message": result["message"],
                    "finish_reason": "stop",
                }
            ],
            "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
            "eido": {
                "agent_id": result["agent_id"],
                "session_id": result["session_id"],
                "tool_events": result["tool_events"],
                "mock": result["mock"],
            },
        }

    @app.get("/sessions/{session_id}")
    async def get_session(session_id: str) -> dict[str, Any]:
        session = runtime.get_session(session_id)
        if session is None:
            raise HTTPException(status_code=404, detail="Session not found")
        return {"session": session.model_dump()}

    @app.get("/skills")
    async def list_skills() -> dict[str, Any]:
        return {"skills": runtime.skills.list()}

    return app


async def _chat_stream(runtime: AgentRuntime, req: ChatRequest) -> AsyncIterator[str]:
    try:
        async for event in runtime.stream_chat(
            agent_id=req.agent_id,
            message=req.message,
            images=req.images,
            attachment_paths=req.attachment_paths,
            model=req.model,
            session_id=req.session_id,
            visitor_id=req.visitor_id,
            slash_command=req.slash_command,
            working_directory=req.working_directory,
            permission_mode=req.permission_mode,
            project_context=req.project_context,
        ):
            yield f"{json.dumps(event, ensure_ascii=False)}\n"
    except KeyError as exc:
        yield f"{json.dumps({'type': 'error', 'error': str(exc)}, ensure_ascii=False)}\n"
    except LLMProviderError as exc:
        logger.warning(
            "Streaming provider error agent_id=%s session_id=%s error=%s",
            req.agent_id,
            req.session_id,
            exc,
        )
        yield f"{json.dumps({'type': 'error', 'error': str(exc)}, ensure_ascii=False)}\n"
    except Exception as exc:
        logger.exception(
            "Streaming failed agent_id=%s session_id=%s model=%s",
            req.agent_id,
            req.session_id,
            req.model,
        )
        yield f"{json.dumps({'type': 'error', 'error': _error_detail('模型流式请求失败', exc)}, ensure_ascii=False)}\n"


def _public_agent(profile: AgentProfile) -> dict[str, Any]:
    data = profile.model_dump()
    data.pop("private_facts", None)
    llm = data.get("llm")
    if isinstance(llm, dict) and llm.get("api_key"):
        llm["api_key"] = "********"
    if isinstance(llm, dict) and isinstance(llm.get("providers"), list):
        for provider in llm["providers"]:
            if isinstance(provider, dict) and provider.get("api_key"):
                provider["api_key"] = "********"
    return data


def _error_detail(prefix: str, exc: Exception) -> str:
    detail = str(exc).strip() or exc.__class__.__name__
    message = f"{prefix}：{exc.__class__.__name__}: {detail}"
    return _redact_error_text(_limit_error_text(message))


def _limit_error_text(value: str) -> str:
    normalized = " ".join(value.split())
    return normalized if len(normalized) <= 1600 else normalized[:1600] + "..."


def _redact_error_text(value: str) -> str:
    value = re.sub(r"Bearer\s+[A-Za-z0-9._~+/=-]+", "Bearer [redacted]", value, flags=re.IGNORECASE)
    value = re.sub(r'("api[_-]?key"\s*:\s*")[^"]+(")', r"\1[redacted]\2", value, flags=re.IGNORECASE)
    value = re.sub(r"(api[_-]?key=)[^\s&]+", r"\1[redacted]", value, flags=re.IGNORECASE)
    return value


app = create_app()
