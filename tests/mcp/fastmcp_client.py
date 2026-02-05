"""
FastMCP client smoke test for Penrose-Lamarck.

Connects to the MCP server over HTTP/SSE, lists tools, and calls each tool
with representative payloads.

Public API
----------
- :func:`run_smoke`: Run the MCP smoke test.
- :func:`main`: CLI entrypoint.

Attributes
----------
DEFAULT_SSE_URL : str
    Default MCP SSE URL.
DEFAULT_SERVER_NAME : str
    Default server name used by the MCP client.

Examples
--------
>>> isinstance(DEFAULT_SSE_URL, str)
True

See Also
--------
:mod:`penroselamarck.mcp.transport`
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import uuid
from typing import Any

from fastmcp import Client

DEFAULT_SSE_URL = "http://localhost:8080/v1/mcp/sse"
DEFAULT_SERVER_NAME = "penroselamarck"


def build_client_config(sse_url: str, server_name: str) -> dict:
    """
    build_client_config(sse_url, server_name) -> Dict

    Concise (one-line) description of the function.

    Parameters
    ----------
    sse_url : str
        MCP SSE endpoint URL.
    server_name : str
        Server name for the MCP client configuration.

    Returns
    -------
    Dict
        Client configuration payload.
    """
    return {
        "mcpServers": {
            server_name: {
                "transport": "sse",
                "url": sse_url,
            }
        }
    }


def extract_tool_name(tool: Any) -> str | None:
    """
    extract_tool_name(tool) -> Optional[str]

    Concise (one-line) description of the function.

    Parameters
    ----------
    tool : Any
        Tool object or mapping.

    Returns
    -------
    Optional[str]
        Tool name if present.
    """
    name = getattr(tool, "name", None)
    if name:
        return name
    if isinstance(tool, dict):
        return tool.get("name")
    return None


def build_tool_map(tools: list[Any], server_name: str) -> dict[str, str]:
    """
    build_tool_map(tools, server_name) -> Dict[str, str]

    Concise (one-line) description of the function.

    Parameters
    ----------
    tools : List[Any]
        Tool objects returned by the client.
    server_name : str
        Server name used for prefixing tools.

    Returns
    -------
    Dict[str, str]
        Mapping of base tool names to full tool names.
    """
    mapping: dict[str, str] = {}
    prefix = f"{server_name}_"
    for tool in tools:
        name = extract_tool_name(tool)
        if not name:
            continue
        base = name[len(prefix) :] if name.startswith(prefix) else name
        mapping[base] = name
    return mapping


def extract_text_content(result: Any) -> str | None:
    """
    extract_text_content(result) -> Optional[str]

    Concise (one-line) description of the function.

    Parameters
    ----------
    result : Any
        Tool result object.

    Returns
    -------
    Optional[str]
        First text content payload if available.
    """
    content = getattr(result, "content", None)
    if not content:
        return None
    for item in content:
        text = getattr(item, "text", None)
        if text:
            return text
    return None


def parse_tool_result(result: Any) -> Any:
    """
    parse_tool_result(result) -> Any

    Concise (one-line) description of the function.

    Parameters
    ----------
    result : Any
        Raw tool result object.

    Returns
    -------
    Any
        Parsed payload if possible.
    """
    text = extract_text_content(result)
    if text:
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return text
    data = getattr(result, "data", None)
    if data is not None:
        return data
    return result


async def call_tool(
    client: Client,
    tool_map: dict[str, str],
    base_name: str,
    arguments: dict,
    results: dict[str, Any],
    errors: list[dict],
) -> Any:
    """
    call_tool(client, tool_map, base_name, arguments, results, errors) -> Any

    Concise (one-line) description of the function.

    Parameters
    ----------
    client : Client
        FastMCP client instance.
    tool_map : Dict[str, str]
        Mapping of base tool names to full tool names.
    base_name : str
        Base tool name without server prefix.
    arguments : Dict
        Tool input arguments.
    results : Dict[str, Any]
        Accumulator for tool results.
    errors : List[Dict]
        Accumulator for errors.

    Returns
    -------
    Any
        Parsed tool result or None on error.
    """
    full_name = tool_map.get(base_name)
    if not full_name:
        errors.append({"tool": base_name, "reason": "tool not found"})
        return None
    try:
        response = await client.call_tool(full_name, arguments)
    except Exception as exc:
        errors.append({"tool": base_name, "reason": str(exc)})
        return None
    payload = parse_tool_result(response)
    results[base_name] = payload
    return payload


async def run_smoke(sse_url: str, server_name: str) -> dict[str, Any]:
    """
    run_smoke(sse_url, server_name) -> Dict[str, Any]

    Concise (one-line) description of the function.

    Parameters
    ----------
    sse_url : str
        MCP SSE endpoint URL.
    server_name : str
        Server name used by the MCP client.

    Returns
    -------
    Dict[str, Any]
        Summary of tool results and errors.
    """
    config = build_client_config(sse_url, server_name)
    results: dict[str, Any] = {}
    errors: list[dict] = []

    async with Client(config) as client:
        await client.ping()
        tools = await client.list_tools()
        tool_map = build_tool_map(tools, server_name)
        results["tools"] = sorted(tool_map.keys())

        await call_tool(client, tool_map, "auth.me", {}, results, errors)
        await call_tool(client, tool_map, "auth.login", {"token": "demo"}, results, errors)
        await call_tool(
            client,
            tool_map,
            "study.context.set",
            {"language": "da"},
            results,
            errors,
        )
        await call_tool(client, tool_map, "study.context.get", {}, results, errors)

        exercise_payload = {
            "question": f"hej-{uuid.uuid4().hex[:8]}",
            "answer": "hello",
            "language": "da",
            "tags": ["vocab"],
        }
        created = await call_tool(
            client, tool_map, "exercise.create", exercise_payload, results, errors
        )
        created_id = created.get("exerciseId") if isinstance(created, dict) else None

        await call_tool(
            client,
            tool_map,
            "exercise.list",
            {"language": "da", "limit": 5, "offset": 0},
            results,
            errors,
        )

        train_payload = {
            "items": [
                {
                    "question": f"goodbye-{uuid.uuid4().hex[:8]}",
                    "answer": "farvel",
                    "language": "da",
                    "tags": ["vocab"],
                }
            ]
        }
        await call_tool(client, tool_map, "train.import", train_payload, results, errors)

        session = await call_tool(
            client,
            tool_map,
            "practice.start",
            {"language": "da", "count": 1, "strategy": "mixed"},
            results,
            errors,
        )
        session_id = session.get("sessionId") if isinstance(session, dict) else None

        next_item = None
        if session_id:
            next_item = await call_tool(
                client,
                tool_map,
                "practice.next",
                {"sessionId": session_id},
                results,
                errors,
            )

        submit_id = None
        if isinstance(next_item, dict):
            submit_id = next_item.get("exerciseId")
        if not submit_id:
            submit_id = created_id

        if session_id and submit_id:
            await call_tool(
                client,
                tool_map,
                "practice.submit",
                {"sessionId": session_id, "exerciseId": submit_id, "userAnswer": "hello"},
                results,
                errors,
            )
            await call_tool(
                client,
                tool_map,
                "practice.end",
                {"sessionId": session_id},
                results,
                errors,
            )

        await call_tool(
            client,
            tool_map,
            "metrics.performance",
            {"language": "da"},
            results,
            errors,
        )

    return {"results": results, "errors": errors}


def parse_args(argv: list[str]) -> argparse.Namespace:
    """
    parse_args(argv) -> Namespace

    Concise (one-line) description of the function.

    Parameters
    ----------
    argv : List[str]
        Command-line arguments.

    Returns
    -------
    Namespace
        Parsed arguments.
    """
    parser = argparse.ArgumentParser(description="FastMCP client smoke test")
    parser.add_argument("--sse-url", default=DEFAULT_SSE_URL)
    parser.add_argument("--server-name", default=DEFAULT_SERVER_NAME)
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    """
    main(argv) -> int

    Concise (one-line) description of the function.

    Parameters
    ----------
    argv : List[str]
        Command-line arguments.

    Returns
    -------
    int
        Process exit code.
    """
    args = parse_args(argv)
    summary = asyncio.run(run_smoke(args.sse_url, args.server_name))
    print(json.dumps(summary, indent=2, default=str))
    if summary.get("errors"):
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
