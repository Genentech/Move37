"""
MCP transport endpoints.

Defines HTTP/SSE endpoints for MCP JSON-RPC traffic.

Public API
----------
- :data:`router`: FastAPI router for MCP transport.

Attributes
----------
router : APIRouter
    Router exposing MCP transport endpoints.

Examples
--------
>>> from penroselamarck.api.routers.mcp import router
>>> router.prefix
''

See Also
--------
:mod:`penroselamarck.api.transport`
"""

from __future__ import annotations

from json import JSONDecodeError
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse

from penroselamarck.api.dependencies import get_current_user, get_mcp_transport
from penroselamarck.api.transport import McpHttpTransport
from penroselamarck.repositories.user_repository import UserRecord

router = APIRouter()


@router.get("/mcp/sse")
async def mcp_sse(
    request: Request,
    transport: Annotated[McpHttpTransport, Depends(get_mcp_transport)],
    current_user: Annotated[UserRecord, Depends(get_current_user)],
):
    """
    mcp_sse(request, transport, current_user) -> StreamingResponse

    Concise (one-line) description of the function.

    Parameters
    ----------
    request : Request
        FastAPI request context.
    transport : McpHttpTransport
        MCP transport dependency.
    current_user : UserRecord
        Authenticated user record.

    Returns
    -------
    StreamingResponse
        SSE stream for MCP messages.
    """
    _ = current_user
    if not request.url.path.endswith("/mcp/sse"):
        raise HTTPException(status_code=400, detail="Invalid SSE path")
    endpoint_base = request.url.path[: -len("/sse")]
    endpoint_path = f"{endpoint_base}/messages"
    return await transport.sse_endpoint(request, endpoint_path)


@router.post("/mcp/messages", status_code=202)
async def mcp_messages(
    request: Request,
    session_id: str,
    transport: Annotated[McpHttpTransport, Depends(get_mcp_transport)],
    current_user: Annotated[UserRecord, Depends(get_current_user)],
) -> dict:
    """
    mcp_messages(request, session_id, transport, current_user) -> Dict

    Concise (one-line) description of the function.

    Parameters
    ----------
    request : Request
        FastAPI request context.
    session_id : str
        MCP session identifier.
    transport : McpHttpTransport
        MCP transport dependency.
    current_user : UserRecord
        Authenticated user record.

    Returns
    -------
    Dict
        Acknowledgement response.
    """
    _ = current_user
    try:
        payload = await request.json()
    except JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid JSON payload") from exc
    await transport.handle_post(session_id, payload)
    return {"status": "accepted"}


@router.post("/mcp/sse")
async def mcp_streamable_http(
    request: Request,
    transport: Annotated[McpHttpTransport, Depends(get_mcp_transport)],
    current_user: Annotated[UserRecord, Depends(get_current_user)],
) -> JSONResponse:
    """
    mcp_streamable_http(request, transport, current_user) -> JSONResponse

    Concise (one-line) description of the function.

    Parameters
    ----------
    request : Request
        FastAPI request context.
    transport : McpHttpTransport
        MCP transport dependency.
    current_user : UserRecord
        Authenticated user record.

    Returns
    -------
    JSONResponse
        JSON-RPC response payload for streamable HTTP clients.

    Examples
    --------
    >>> callable(mcp_streamable_http)
    True
    """
    _ = current_user
    try:
        payload = await request.json()
    except JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid JSON payload") from exc
    response = transport.handle_request(payload)
    if response is None:
        return JSONResponse(status_code=202, content={"status": "accepted"})
    return JSONResponse(content=response)
