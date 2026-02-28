"""
MCP HTTP/SSE transport.

Implements a minimal MCP server over HTTP POST + Server-Sent Events.

Public API
----------
- :class:`McpSessionManager`: Manages SSE sessions and queues.
- :class:`McpHttpTransport`: Handles MCP JSON-RPC over HTTP/SSE.

Attributes
----------
DEFAULT_PROTOCOL_VERSION : str
    MCP protocol version advertised during initialization.

Examples
--------
>>> from penroselamarck.services.container import ServiceContainer
>>> from penroselamarck.api.tool_registry import McpToolRegistry
>>> transport = McpHttpTransport(McpToolRegistry(ServiceContainer()))
>>> isinstance(transport, McpHttpTransport)
True

See Also
--------
:mod:`penroselamarck.api.tool_registry`
"""

from __future__ import annotations

import asyncio
import json
import os
import uuid
from collections.abc import Callable
from typing import Any

from fastapi import Request
from fastapi.responses import StreamingResponse

from penroselamarck.api import __version__ as mcp_version
from penroselamarck.api.tool_registry import McpToolRegistry
from penroselamarck.services.errors import ServiceError

DEFAULT_PROTOCOL_VERSION = "2024-11-05"
DEFAULT_SERVER_NAME = "penroselamarck-api"


class McpSessionManager:
    """
    McpSessionManager() -> McpSessionManager

    Concise (one-line) description of the session manager.

    Methods
    -------
    create_session()
        Create a new session with a queue.
    get_queue(session_id)
        Retrieve a session queue.
    remove_session(session_id)
        Remove a session.
    """

    def __init__(self) -> None:
        """
        __init__() -> None

        Concise (one-line) description of the initializer.

        Parameters
        ----------
        None
            This initializer does not accept parameters.

        Returns
        -------
        None
            Initializes session storage.
        """
        self._queues: dict[str, asyncio.Queue] = {}
        self._lock = asyncio.Lock()

    async def create_session(self) -> str:
        """
        create_session() -> str

        Concise (one-line) description of the function.

        Parameters
        ----------
        None
            This function does not accept parameters.

        Returns
        -------
        str
            New session identifier.
        """
        session_id = uuid.uuid4().hex
        async with self._lock:
            self._queues[session_id] = asyncio.Queue()
        return session_id

    async def get_queue(self, session_id: str) -> asyncio.Queue | None:
        """
        get_queue(session_id) -> Optional[Queue]

        Concise (one-line) description of the function.

        Parameters
        ----------
        session_id : str
            Session identifier.

        Returns
        -------
        Optional[Queue]
            Queue for the session.
        """
        async with self._lock:
            return self._queues.get(session_id)

    async def remove_session(self, session_id: str) -> None:
        """
        remove_session(session_id) -> None

        Concise (one-line) description of the function.

        Parameters
        ----------
        session_id : str
            Session identifier.

        Returns
        -------
        None
            Removes the session if present.
        """
        async with self._lock:
            self._queues.pop(session_id, None)


class McpHttpTransport:
    """
    McpHttpTransport(tool_registry) -> McpHttpTransport

    Concise (one-line) description of the transport.

    Methods
    -------
    sse_endpoint(request, endpoint_path)
        Create an SSE stream for MCP messages.
    handle_post(session_id, payload)
        Handle incoming MCP JSON-RPC messages.
    handle_request(payload)
        Handle a single JSON-RPC request and return the response.
    """

    def __init__(self, tool_registry: McpToolRegistry) -> None:
        """
        __init__(tool_registry) -> None

        Concise (one-line) description of the initializer.

        Parameters
        ----------
        tool_registry : McpToolRegistry
            Registry for tools and handlers.

        Returns
        -------
        None
            Initializes the transport.
        """
        self._tool_registry = tool_registry
        self._sessions = McpSessionManager()

    async def sse_endpoint(self, request: Request, endpoint_path: str) -> StreamingResponse:
        """
        sse_endpoint(request, endpoint_path) -> StreamingResponse

        Concise (one-line) description of the function.

        Parameters
        ----------
        request : Request
            FastAPI request context.
        endpoint_path : str
            Absolute path for POST messages.

        Returns
        -------
        StreamingResponse
            SSE stream response.
        """
        session_id = await self._sessions.create_session()
        endpoint_url = (
            str(request.base_url).rstrip("/") + endpoint_path + f"?session_id={session_id}"
        )
        stream = self._event_stream(session_id, endpoint_url)
        return StreamingResponse(stream, media_type="text/event-stream")

    async def handle_post(self, session_id: str, payload: dict) -> None:
        """
        handle_post(session_id, payload) -> None

        Concise (one-line) description of the function.

        Parameters
        ----------
        session_id : str
            Session identifier.
        payload : Dict
            JSON-RPC payload.

        Returns
        -------
        None
            Sends response to the session queue.
        """
        queue = await self._sessions.get_queue(session_id)
        if queue is None:
            return
        response = self._handle_json_rpc(payload)
        if response is None:
            return
        await queue.put(response)

    def handle_request(self, payload: dict) -> dict | None:
        """
        handle_request(payload) -> Optional[Dict]

        Concise (one-line) description of the function.

        Parameters
        ----------
        payload : Dict
            JSON-RPC request payload.

        Returns
        -------
        Optional[Dict]
            JSON-RPC response payload or None for notifications.

        Examples
        --------
        >>> isinstance(McpHttpTransport.__name__, str)
        True
        """
        return self._handle_json_rpc(payload)

    async def _event_stream(self, session_id: str, endpoint_url: str):
        """
        _event_stream(session_id, endpoint_url) -> AsyncIterator[str]

        Concise (one-line) description of the function.

        Parameters
        ----------
        session_id : str
            Session identifier.
        endpoint_url : str
            URL for POST messages.

        Returns
        -------
        AsyncIterator[str]
            SSE stream yielding events.
        """
        queue = await self._sessions.get_queue(session_id)
        if queue is None:
            return
        try:
            yield self._format_event(
                "endpoint", {"endpoint": endpoint_url, "sessionId": session_id}
            )
            while True:
                message = await queue.get()
                yield self._format_event("message", message)
        except asyncio.CancelledError:
            raise
        finally:
            await self._sessions.remove_session(session_id)

    def _handle_json_rpc(self, payload: dict) -> dict | None:
        """
        _handle_json_rpc(payload) -> Optional[Dict]

        Concise (one-line) description of the function.

        Parameters
        ----------
        payload : Dict
            JSON-RPC request payload.

        Returns
        -------
        Optional[Dict]
            JSON-RPC response or None for notifications.
        """
        method, request_id, params, error = self._parse_json_rpc(payload)
        if error is not None:
            return error
        if request_id is None:
            return None
        try:
            return self._dispatch_method(method, request_id, params)
        except ServiceError as exc:
            return self._error_response(request_id, -32000, exc.message)
        except ValueError as exc:
            return self._error_response(request_id, -32001, str(exc))
        except Exception:
            return self._error_response(request_id, -32603, "Internal error")

    def _parse_json_rpc(self, payload: dict) -> tuple[str | None, Any, dict, dict | None]:
        """
        _parse_json_rpc(payload) -> Tuple[Optional[str], Any, Dict, Optional[Dict]]

        Concise (one-line) description of the function.

        Parameters
        ----------
        payload : Dict
            JSON-RPC request payload.

        Returns
        -------
        Tuple[Optional[str], Any, Dict, Optional[Dict]]
            Method name, request id, params, and error response if invalid.
        """
        if not isinstance(payload, dict):
            return None, None, {}, self._error_response(None, -32600, "Invalid Request")
        method = payload.get("method")
        request_id = payload.get("id")
        if payload.get("jsonrpc") != "2.0" or not method:
            return None, request_id, {}, self._error_response(request_id, -32600, "Invalid Request")
        params = payload.get("params", {})
        if params is None:
            params = {}
        return method, request_id, params, None

    def _dispatch_method(self, method: str, request_id: Any, params: dict) -> dict:
        """
        _dispatch_method(method, request_id, params) -> Dict

        Concise (one-line) description of the function.

        Parameters
        ----------
        method : str
            JSON-RPC method name.
        request_id : Any
            JSON-RPC request identifier.
        params : Dict
            Method parameters.

        Returns
        -------
        Dict
            JSON-RPC response for the method.
        """
        handler = self._method_handlers().get(method)
        if handler is None:
            return self._error_response(request_id, -32601, "Method not found")
        return handler(request_id, params)

    def _method_handlers(self) -> dict[str, Callable[[Any, dict], dict]]:
        """
        _method_handlers() -> Dict[str, Callable[[Any, Dict], Dict]]

        Concise (one-line) description of the function.

        Parameters
        ----------
        None
            This function does not accept parameters.

        Returns
        -------
        Dict[str, Callable[[Any, Dict], Dict]]
            Mapping of method names to handlers.
        """
        return {
            "initialize": self._handle_initialize,
            "ping": self._handle_ping,
            "tools/list": self._handle_tools_list,
            "tools/call": self._handle_tools_call,
            "resources/list": self._handle_resources_list,
            "prompts/list": self._handle_prompts_list,
        }

    def _handle_initialize(self, request_id: Any, params: dict) -> dict:
        """
        _handle_initialize(request_id, params) -> Dict

        Concise (one-line) description of the function.

        Parameters
        ----------
        request_id : Any
            JSON-RPC request identifier.
        params : Dict
            Initialize parameters (unused).

        Returns
        -------
        Dict
            Initialization response.
        """
        _ = params
        return self._initialize_response(request_id)

    def _handle_ping(self, request_id: Any, params: dict) -> dict:
        """
        _handle_ping(request_id, params) -> Dict

        Concise (one-line) description of the function.

        Parameters
        ----------
        request_id : Any
            JSON-RPC request identifier.
        params : Dict
            Ping parameters (unused).

        Returns
        -------
        Dict
            Ping response payload.
        """
        _ = params
        return self._result_response(request_id, {"ok": True})

    def _handle_tools_list(self, request_id: Any, params: dict) -> dict:
        """
        _handle_tools_list(request_id, params) -> Dict

        Concise (one-line) description of the function.

        Parameters
        ----------
        request_id : Any
            JSON-RPC request identifier.
        params : Dict
            List parameters (unused).

        Returns
        -------
        Dict
            Tools list response.
        """
        _ = params
        return self._result_response(request_id, {"tools": self._tool_registry.list_tools()})

    def _handle_tools_call(self, request_id: Any, params: dict) -> dict:
        """
        _handle_tools_call(request_id, params) -> Dict

        Concise (one-line) description of the function.

        Parameters
        ----------
        request_id : Any
            JSON-RPC request identifier.
        params : Dict
            Tool call parameters.

        Returns
        -------
        Dict
            Tool call response.
        """
        return self._handle_tool_call(request_id, params)

    def _handle_resources_list(self, request_id: Any, params: dict) -> dict:
        """
        _handle_resources_list(request_id, params) -> Dict

        Concise (one-line) description of the function.

        Parameters
        ----------
        request_id : Any
            JSON-RPC request identifier.
        params : Dict
            List parameters (unused).

        Returns
        -------
        Dict
            Resources list response.
        """
        _ = params
        return self._result_response(request_id, {"resources": []})

    def _handle_prompts_list(self, request_id: Any, params: dict) -> dict:
        """
        _handle_prompts_list(request_id, params) -> Dict

        Concise (one-line) description of the function.

        Parameters
        ----------
        request_id : Any
            JSON-RPC request identifier.
        params : Dict
            List parameters (unused).

        Returns
        -------
        Dict
            Prompts list response.
        """
        _ = params
        return self._result_response(request_id, {"prompts": []})

    def _initialize_response(self, request_id: Any) -> dict:
        """
        _initialize_response(request_id) -> Dict

        Concise (one-line) description of the function.

        Parameters
        ----------
        request_id : Any
            JSON-RPC request identifier.

        Returns
        -------
        Dict
            JSON-RPC initialization response.
        """
        server_name = os.environ.get("MCP_SERVER_NAME", DEFAULT_SERVER_NAME) or DEFAULT_SERVER_NAME
        server_version = os.environ.get("MCP_SERVER_VERSION", mcp_version) or mcp_version
        return self._result_response(
            request_id,
            {
                "protocolVersion": DEFAULT_PROTOCOL_VERSION,
                "capabilities": {"tools": {}},
                "serverInfo": {"name": server_name, "version": server_version},
            },
        )

    def _handle_tool_call(self, request_id: Any, params: dict) -> dict:
        """
        _handle_tool_call(request_id, params) -> Dict

        Concise (one-line) description of the function.

        Parameters
        ----------
        request_id : Any
            JSON-RPC request identifier.
        params : Dict
            Tool call parameters.

        Returns
        -------
        Dict
            JSON-RPC tool call response.
        """
        name = params.get("name")
        arguments = params.get("arguments", {})
        if not name:
            return self._error_response(request_id, -32602, "Missing tool name")
        result = self._tool_registry.call_tool(name, arguments)
        payload = {
            "content": [
                {
                    "type": "text",
                    "text": json.dumps(result, default=str),
                }
            ]
        }
        return self._result_response(request_id, payload)

    def _result_response(self, request_id: Any, result: dict) -> dict:
        """
        _result_response(request_id, result) -> Dict

        Concise (one-line) description of the function.

        Parameters
        ----------
        request_id : Any
            JSON-RPC request identifier.
        result : Dict
            Result payload.

        Returns
        -------
        Dict
            JSON-RPC response object.
        """
        return {"jsonrpc": "2.0", "id": request_id, "result": result}

    def _error_response(self, request_id: Any, code: int, message: str) -> dict:
        """
        _error_response(request_id, code, message) -> Dict

        Concise (one-line) description of the function.

        Parameters
        ----------
        request_id : Any
            JSON-RPC request identifier.
        code : int
            Error code.
        message : str
            Error message.

        Returns
        -------
        Dict
            JSON-RPC error response object.
        """
        return {"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}}

    def _format_event(self, event: str, data: dict) -> str:
        """
        _format_event(event, data) -> str

        Concise (one-line) description of the function.

        Parameters
        ----------
        event : str
            SSE event name.
        data : Dict
            Event payload.

        Returns
        -------
        str
            SSE-formatted event string.
        """
        payload = json.dumps(data, default=str)
        return f"event: {event}\ndata: {payload}\n\n"
